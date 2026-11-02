#import <CommonCrypto/CommonHMAC.h>
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <arpa/inet.h>
#import <errno.h>
#import <fcntl.h>
#import <netinet/in.h>
#import <netinet/tcp.h>
#import <objc/runtime.h>
#import <string.h>
#import <sys/socket.h>
#import <unistd.h>

#import "BroadcastLink.h"
#import "Logger.h"
#import "Utils.h"

// Discord's screen share extension streams on its own and takes its orders from the app, over a Unix socket in their
// app group. Not every signer gives the two the same group, so they also meet on a loopback port. The port and the
// proofs each side gives come from the extension's signature files, which both can read and other apps can't. Each
// proof is over nonces both sides just picked, so one seen on the wire can't be played back on another connection: a
// process that listened on the port first learns nothing it could use to pass for the extension.

#define LINK_FIRST_PORT 49152
#define LINK_PORT_RANGE 16000
#define LINK_PORTS      8
#define LINK_TIMEOUT    2
#define LINK_NONCE      32
// The app may still be setting its voice engine up when the extension starts
#define LINK_ATTEMPTS    6
#define LINK_RETRY_DELAY 500000

@protocol DCDBroadcastSocketServerDelegate
- (void)broadcastSocketServer:(id)server newConnection:(id)connection;
@end

@interface DCDBroadcastSocketConnection : NSObject
- (instancetype)initWithFd:(int)fd delegate:(id)delegate;
@end

@interface DCDBroadcastSocketServer : NSObject
@property (nonatomic, weak) id<DCDBroadcastSocketServerDelegate> delegate;
@end

@interface DCDSampleHandler : NSObject
- (void)finishBroadcastWithError:(NSError *)error;
@end

static NSData *linkKey(void)
{
    static NSData *key;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        NSBundle *main = NSBundle.mainBundle;
        NSString *extension = isAppExtension()
            ? main.bundlePath
            : [main.builtInPlugInsPath stringByAppendingPathComponent:@"BroadcastUpload.appex"];
        for (NSString *name in @[ @"embedded.mobileprovision", @"_CodeSignature/CodeResources" ])
        {
            NSData *file = [NSData dataWithContentsOfFile:[extension stringByAppendingPathComponent:name]];
            if (file.length)
            {
                key = file;
                break;
            }
        }
        BunnyLog(@"Screen share link key: %@", key ? @"found" : @"none");
    });
    return key;
}

static NSData *linkProof(const char *role)
{
    NSData *key = linkKey();
    if (!key) return nil;
    uint8_t proof[CC_SHA256_DIGEST_LENGTH];
    CCHmac(kCCHmacAlgSHA256, key.bytes, key.length, role, strlen(role), proof);
    return [NSData dataWithBytes:proof length:sizeof(proof)];
}

static uint16_t linkPort(void)
{
    uint8_t bytes[2];
    [linkProof("port") getBytes:bytes length:sizeof(bytes)];
    return LINK_FIRST_PORT + ((bytes[0] << 8 | bytes[1]) % LINK_PORT_RANGE);
}

static struct sockaddr_in loopbackAddress(uint16_t port)
{
    struct sockaddr_in address = {0};
    address.sin_len         = sizeof(address);
    address.sin_family      = AF_INET;
    address.sin_port        = htons(port);
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    return address;
}

/** How long a call on the socket may block; 0 lifts it */
static void setTimeout(int fd, int seconds)
{
    struct timeval timeout = {.tv_sec = seconds};
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
}

static void prepareSocket(int fd)
{
    int on = 1;
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, sizeof(on));
    setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &on, sizeof(on));
    setTimeout(fd, LINK_TIMEOUT);
}

static BOOL sendAll(int fd, NSData *data)
{
    return data && send(fd, data.bytes, data.length, 0) == (ssize_t)data.length;
}

static BOOL receiveExactly(int fd, uint8_t *buffer, size_t length)
{
    return recv(fd, buffer, length, MSG_WAITALL) == (ssize_t)length;
}

static NSData *randomNonce(void)
{
    uint8_t bytes[LINK_NONCE];
    if (SecRandomCopyBytes(kSecRandomDefault, sizeof(bytes), bytes) != errSecSuccess) arc4random_buf(bytes, sizeof(bytes));
    return [NSData dataWithBytes:bytes length:sizeof(bytes)];
}

/** HMAC(key, role || first || second): a proof of the key that is bound to this connection's two nonces */
static NSData *linkProofFor(const char *role, NSData *first, NSData *second)
{
    NSData *key = linkKey();
    if (!key || !first || !second) return nil;
    CCHmacContext context;
    CCHmacInit(&context, kCCHmacAlgSHA256, key.bytes, key.length);
    CCHmacUpdate(&context, role, strlen(role));
    CCHmacUpdate(&context, first.bytes, first.length);
    CCHmacUpdate(&context, second.bytes, second.length);
    uint8_t proof[CC_SHA256_DIGEST_LENGTH];
    CCHmacFinal(&context, proof);
    return [NSData dataWithBytes:proof length:sizeof(proof)];
}

/**
 * The extension's side of the handshake: its nonce goes first; the app answers with its own nonce and a proof over
 * both; then the extension proves itself over both. A listener without the key fails at its answer, before the
 * extension has said anything another connection could use.
 */
static BOOL clientHandshake(int fd)
{
    NSData *ours = randomNonce();
    if (!sendAll(fd, ours)) return NO;
    uint8_t answer[LINK_NONCE + CC_SHA256_DIGEST_LENGTH];
    if (!receiveExactly(fd, answer, sizeof(answer))) return NO;
    NSData *theirs = [NSData dataWithBytes:answer length:LINK_NONCE];
    NSData *expected = linkProofFor("server", ours, theirs);
    if (!expected || timingsafe_bcmp(answer + LINK_NONCE, expected.bytes, CC_SHA256_DIGEST_LENGTH) != 0) return NO;
    return sendAll(fd, linkProofFor("client", theirs, ours));
}

/** The app's side of the same handshake */
static BOOL serverHandshake(int fd)
{
    uint8_t received[LINK_NONCE];
    if (!receiveExactly(fd, received, sizeof(received))) return NO;
    NSData *theirs = [NSData dataWithBytes:received length:sizeof(received)];
    NSData *ours = randomNonce();
    NSData *proof = linkProofFor("server", theirs, ours);
    if (!proof) return NO;
    NSMutableData *answer = [ours mutableCopy];
    [answer appendData:proof];
    if (!sendAll(fd, answer)) return NO;
    uint8_t theirProof[CC_SHA256_DIGEST_LENGTH];
    if (!receiveExactly(fd, theirProof, sizeof(theirProof))) return NO;
    NSData *expected = linkProofFor("client", ours, theirs);
    return expected && timingsafe_bcmp(theirProof, expected.bytes, sizeof(theirProof)) == 0;
}

/** Why the extension has no link: ReplayKit shows it, as the extension has nowhere else to say so */
static NSString *linkFailure;

/** The extension's end of the link, or -1 */
static int connectToApp(void)
{
    if (!linkKey())
    {
        linkFailure = @"no signature files to derive the link from";
        return -1;
    }

    for (int attempt = 0; attempt < LINK_ATTEMPTS; attempt++)
    {
        if (attempt) usleep(LINK_RETRY_DELAY);
        for (int i = 0; i < LINK_PORTS; i++)
        {
            int fd = socket(AF_INET, SOCK_STREAM, 0);
            if (fd < 0)
            {
                linkFailure = [NSString stringWithFormat:@"socket: %s", strerror(errno)];
                return -1;
            }
            prepareSocket(fd);
            struct sockaddr_in address = loopbackAddress(linkPort() + i);
            if (connect(fd, (struct sockaddr *)&address, sizeof(address)) != 0)
            {
                linkFailure = [NSString stringWithFormat:@"port %d: %s", linkPort() + i, strerror(errno)];
            }
            else if (!clientHandshake(fd))
            {
                linkFailure = [NSString stringWithFormat:@"port %d answered without the proof: %s", linkPort() + i, strerror(errno)];
            }
            else
            {
                setTimeout(fd, 0);
                linkFailure = nil;
                return fd;
            }
            close(fd);
        }
    }
    return -1;
}

static int listenOnLoopback(void)
{
    if (!linkKey()) return -1;

    for (int i = 0; i < LINK_PORTS; i++)
    {
        int fd = socket(AF_INET, SOCK_STREAM, 0);
        if (fd < 0) return -1;
        int on = 1;
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof(on));
        struct sockaddr_in address = loopbackAddress(linkPort() + i);
        if (bind(fd, (struct sockaddr *)&address, sizeof(address)) == 0 && listen(fd, 4) == 0
            && fcntl(fd, F_SETFL, O_NONBLOCK) == 0)
        {
            return fd;
        }
        close(fd);
    }
    return -1;
}

static id ivarOf(id object, const char *name)
{
    Ivar ivar = class_getInstanceVariable(object_getClass(object), name);
    return ivar ? object_getIvar(object, ivar) : nil;
}

/** What -[DCDBroadcastSocketServer _acceptConnections] does with a socket */
static void addConnection(DCDBroadcastSocketServer *server, int fd)
{
    id connection = [[objc_getClass("DCDBroadcastSocketConnection") alloc] initWithFd:fd delegate:server];
    [(NSMutableArray *)ivarOf(server, "_connections") addObject:connection];
    [server.delegate broadcastSocketServer:server newConnection:connection];
}

static void acceptOnLoopback(DCDBroadcastSocketServer *server, int listener, dispatch_source_t source)
{
    dispatch_queue_t queue = ivarOf(server, "_queue");

    int fd;
    while ((fd = accept(listener, NULL, NULL)) >= 0)
    {
        // Not on Discord's queue: whoever connects decides how long the proof takes
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) & ~O_NONBLOCK);
            prepareSocket(fd);
            if (!serverHandshake(fd))
            {
                BunnyLog(@"Refused a screen share connection without the right proof");
                close(fd);
                return;
            }
            setTimeout(fd, 0);
            dispatch_async(queue, ^{
                if (dispatch_source_testcancel(source)) close(fd);
                else addConnection(server, fd);
            });
        });
    }
}

static dispatch_source_t listenerSource;

static void stopLoopback(void)
{
    if (!listenerSource) return;
    dispatch_source_cancel(listenerSource);
    listenerSource = nil;
}

static BOOL startLoopback(DCDBroadcastSocketServer *server)
{
    stopLoopback();
    dispatch_queue_t queue = ivarOf(server, "_queue");
    int listener = queue ? listenOnLoopback() : -1;
    if (listener < 0)
    {
        BunnyLog(@"The screen share link has no port");
        return NO;
    }

    dispatch_source_t source = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, listener, 0, queue);
    __weak DCDBroadcastSocketServer *weakServer = server;
    dispatch_source_set_event_handler(source, ^{
        DCDBroadcastSocketServer *strongServer = weakServer;
        if (strongServer) acceptOnLoopback(strongServer, listener, source);
    });
    dispatch_source_set_cancel_handler(source, ^{ close(listener); });
    dispatch_resume(source);
    listenerSource = source;
    return YES;
}

%group BroadcastLink

%hook DCDBroadcastSocketServer
- (BOOL)startWithError:(NSError **)error
{
    BOOL started = %orig;
    return startLoopback(self) || started;
}

- (void)stop
{
    stopLoopback();
    %orig;
}
%end

%hook DCDBroadcastSocketConnection
+ (id)connectToPath:(NSString *)path delegate:(id)delegate
{
    id connection = %orig;
    if (connection) return connection;

    int fd = connectToApp();
    BunnyLog(@"Screen share link: %@", fd >= 0 ? @"connected" : @"the app didn't answer");
    return fd >= 0 ? [[self alloc] initWithFd:fd delegate:delegate] : nil;
}
%end

%end

// Discord gives up on a failed connection in its init, where ReplayKit doesn't listen: the phone would go on sharing
%group BroadcastFailure

%hook DCDSampleHandler
- (void)broadcastStartedWithSetupInfo:(NSDictionary *)setupInfo
{
    %orig;
    if (!linkFailure) return;

    NSString *reason = [NSString stringWithFormat:@"Endcord couldn't reach the app (%@)", linkFailure];
    [self finishBroadcastWithError:[NSError errorWithDomain:@"com.endcord.broadcast" code:1
                                                   userInfo:@{NSLocalizedDescriptionKey : reason}]];
}
%end

%end

void initBroadcastLink(void)
{
    if (objc_getClass("DCDBroadcastSocketServer") && objc_getClass("DCDBroadcastSocketConnection")) %init(BroadcastLink);
    if (objc_getClass("DCDSampleHandler")) %init(BroadcastFailure);
}
