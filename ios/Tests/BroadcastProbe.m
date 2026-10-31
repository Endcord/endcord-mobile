// Loaded into the real Discord by real-discord.sh: Discord's own screen share socket classes, with the tweak's link
// and no app group, carrying a message each way. Prints "PROBE PASS|FAIL <check>" lines, then "PROBE DONE".
#import <Foundation/Foundation.h>
#import <objc/message.h>

static void report(BOOL ok, NSString *name)
{
    printf("PROBE %s %s\n", ok ? "PASS" : "FAIL", name.UTF8String);
    fflush(stdout);
}

@interface Probe : NSObject
@property (atomic, strong) id accepted;
@property (atomic, strong) id toServer;
@property (atomic, strong) id toClient;
@end

@implementation Probe
- (void)broadcastSocketServer:(id)server newConnection:(id)connection
{
    self.accepted = connection;
}
- (void)broadcastSocketServer:(id)server connection:(id)connection receivedMessage:(id)message
{
    self.toServer = message;
}
- (void)broadcastSocketServer:(id)server connectionDidClose:(id)connection
{
}
- (void)broadcastSocketConnection:(id)connection receivedMessage:(id)message
{
    self.toClient = message;
}
- (void)broadcastSocketConnectionDidClose:(id)connection
{
}
@end

static void whenTrue(BOOL (^condition)(void), int tries, void (^then)(void))
{
    if (condition() || tries <= 0)
    {
        then();
        return;
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        whenTrue(condition, tries - 1, then);
    });
}

static void runProbe(void)
{
    NSString *extension = [NSBundle.mainBundle.bundlePath stringByAppendingPathComponent:@"PlugIns/BroadcastUpload.appex"];
    [NSFileManager.defaultManager createDirectoryAtPath:extension withIntermediateDirectories:YES attributes:nil error:nil];
    [@"profile" writeToFile:[extension stringByAppendingPathComponent:@"embedded.mobileprovision"]
                 atomically:YES encoding:NSUTF8StringEncoding error:nil];

    static Probe *probe;
    static id server, client;
    probe = [Probe new];
    NSString *path = @"/nonexistent/bcast_tx.sock";

    Class serverClass = NSClassFromString(@"DCDBroadcastSocketServer");
    Class connectionClass = NSClassFromString(@"DCDBroadcastSocketConnection");
    report(serverClass && connectionClass, @"classes");

    server = ((id(*)(id, SEL, id, id))objc_msgSend)(serverClass, NSSelectorFromString(@"serverWithPath:delegate:"), path, probe);
    NSError *error;
    BOOL started = ((BOOL(*)(id, SEL, NSError **))objc_msgSend)(server, NSSelectorFromString(@"startWithError:"), &error);
    report(started, @"server-starts");

    client = ((id(*)(id, SEL, id, id))objc_msgSend)(connectionClass, NSSelectorFromString(@"connectToPath:delegate:"), path, probe);
    report(client != nil, @"client-connects");
    if (!client)
    {
        printf("PROBE DONE\n");
        fflush(stdout);
        return;
    }

    whenTrue(^BOOL { return probe.accepted != nil; }, 50, ^{
        report(probe.accepted != nil, @"server-accepts");
        ((void (*)(id, SEL, id))objc_msgSend)(client, NSSelectorFromString(@"sendMessage:"), @{ @"type" : @"up" });
        whenTrue(^BOOL { return probe.toServer != nil; }, 50, ^{
            report([[probe.toServer description] containsString:@"up"], @"message-to-app");
            ((void (*)(id, SEL, id))objc_msgSend)(server, NSSelectorFromString(@"broadcastMessage:"), @{ @"type" : @"down" });
            whenTrue(^BOOL { return probe.toClient != nil; }, 50, ^{
                report([[probe.toClient description] containsString:@"down"], @"message-to-extension");
                printf("PROBE DONE\n");
                fflush(stdout);
            });
        });
    });
}

__attribute__((constructor)) static void start(void)
{
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(8 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ runProbe(); });
}
