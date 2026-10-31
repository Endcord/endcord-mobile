#import <CommonCrypto/CommonHMAC.h>
#import <Foundation/Foundation.h>
#import <arpa/inet.h>
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
// app group. Not every signer gives the two the same group, so they also meet on a loopback port. The port and the proof
// each side gives come from the extension's signature files, which both can read and other apps can't.

#define LINK_FIRST_PORT 49152
#define LINK_PORT_RANGE 16000
#define LINK_PORTS      8
#define LINK_TIMEOUT    2

@protocol DCDBroadcastSocketServerDelegate
- (void)broadcastSocketServer:(id)server newConnection:(id)connection;
@end

@interface DCDBroadcastSocketConnection : NSObject
- (instancetype)initWithFd:(int)fd delegate:(id)delegate;
@end

@interface DCDBroadcastSocketServer : NSObject
@property (nonatomic, weak) id<DCDBroadcastSocketServerDelegate> delegate;
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

static BOOL sendProof(int fd, NSData *proof)
{
    return send(fd, proof.bytes, proof.length, 0) == (ssize_t)proof.length;
}

static BOOL receiveProof(int fd, NSData *proof)
{
    uint8_t received[CC_SHA256_DIGEST_LENGTH];
    return recv(fd, received, sizeof(received), MSG_WAITALL) == sizeof(received)
        && timingsafe_bcmp(received, proof.bytes, sizeof(received)) == 0;
}

/** The extension's end of the link, or -1 */
static int connectToApp(void)
{
    NSData *ours = linkProof("client"), *theirs = linkProof("server");
    if (!ours) return -1;

    for (int i = 0; i < LINK_PORTS; i++)
    {
        int fd = socket(AF_INET, SOCK_STREAM, 0);
        if (fd < 0) return -1;
        prepareSocket(fd);
        struct sockaddr_in address = loopbackAddress(linkPort() + i);
        if (connect(fd, (struct sockaddr *)&address, sizeof(address)) == 0 && sendProof(fd, ours)
            && receiveProof(fd, theirs))
        {
            setTimeout(fd, 0);
            return fd;
        }
        close(fd);
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
    NSData *theirs = linkProof("client"), *ours = linkProof("server");
    dispatch_queue_t queue = ivarOf(server, "_queue");

    int fd;
    while ((fd = accept(listener, NULL, NULL)) >= 0)
    {
        // Not on Discord's queue: whoever connects decides how long the proof takes
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) & ~O_NONBLOCK);
            prepareSocket(fd);
            if (!receiveProof(fd, theirs) || !sendProof(fd, ours))
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

void initBroadcastLink(void)
{
    if (objc_getClass("DCDBroadcastSocketServer") && objc_getClass("DCDBroadcastSocketConnection")) %init(BroadcastLink);
}
