#import <UIKit/UIKit.h>

#import "Logger.h"
#import "ScreenPrivacy.h"
#import "Utils.h"

/*
 * Endcord's PrivacyCurtain on iOS, like the Android loader's ScreenPrivacy.kt: while it's on, Discord is covered as soon
 * as it stops being the active app, so the app switcher's preview, and the snapshot iOS keeps of it, show no chat. The
 * cover goes when Discord is active again.
 *
 * iOS gives an app no way to keep its screen out of screenshots or screen recordings, so "all" covers what "recents"
 * does; the plugin says so. The bundle sets the mode with the `endcord.screenPrivacy.set` bridge method at each start.
 */

static NSString *const kOff     = @"off";
static NSString *const kRecents = @"recents";
static NSString *const kAll     = @"all";

// Read and written on the main thread
static BOOL gOn;
static NSMutableArray<UIView *> *gCovers;
static NSMutableArray *gObservers;

/** What covers a window; its own class, so it's told apart from Discord's views */
@interface EndcordPrivacyCover : UIView
@end

@implementation EndcordPrivacyCover
@end

/** Every window shown: those of each scene, or an app's without scenes */
static NSArray<UIWindow *> *shownWindows(void)
{
    NSMutableArray<UIWindow *> *windows = [NSMutableArray array];
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes)
    {
        if (![scene isKindOfClass:UIWindowScene.class]) continue;
        for (UIWindow *window in ((UIWindowScene *)scene).windows)
            if (!window.hidden) [windows addObject:window];
    }
    if (windows.count) return windows;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    for (UIWindow *window in UIApplication.sharedApplication.windows)
        if (!window.hidden) [windows addObject:window];
#pragma clang diagnostic pop
    return windows;
}

static void removeCovers(void)
{
    for (UIView *cover in gCovers) [cover removeFromSuperview];
    [gCovers removeAllObjects];
}

static void addCovers(void)
{
    if (!gOn || gCovers.count) return;
    if (!gCovers) gCovers = [NSMutableArray array];
    for (UIWindow *window in shownWindows())
    {
        EndcordPrivacyCover *cover = [[EndcordPrivacyCover alloc] initWithFrame:window.bounds];
        cover.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
        // Opaque: a blur would still show the shape of the messages
        cover.backgroundColor = UIColor.systemBackgroundColor;
        cover.userInteractionEnabled = NO;
        [window addSubview:cover];
        [gCovers addObject:cover];
    }
}

static void startObserving(void)
{
    if (gObservers) return;
    gObservers = [NSMutableArray array];
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    NSOperationQueue *main = NSOperationQueue.mainQueue;
    // Both the app's and the scene's: which of them iOS sends first depends on whether the app has scenes
    NSArray<NSNotificationName> *leaving = @[
        UIApplicationWillResignActiveNotification, UIApplicationDidEnterBackgroundNotification, UISceneWillDeactivateNotification
    ];
    NSArray<NSNotificationName> *back = @[ UIApplicationDidBecomeActiveNotification, UISceneDidActivateNotification ];
    for (NSNotificationName name in leaving)
    {
        [gObservers addObject:[center addObserverForName:name object:nil queue:main usingBlock:^(NSNotification *note) {
                        addCovers();
                    }]];
    }
    for (NSNotificationName name in back)
    {
        [gObservers addObject:[center addObserverForName:name object:nil queue:main usingBlock:^(NSNotification *note) {
                        removeCovers();
                    }]];
    }
}

static void stopObserving(void)
{
    for (id observer in gObservers) [NSNotificationCenter.defaultCenter removeObserver:observer];
    gObservers = nil;
}

NSString *setScreenPrivacy(NSArray *args)
{
    id value = args.count ? args[0] : nil;
    NSString *mode = [value isKindOfClass:NSString.class]
                         ? [(NSString *)value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet]
                         : @"";
    if (![mode isEqualToString:kRecents] && ![mode isEqualToString:kAll]) mode = kOff;
    // The screen share extension loads the tweak too, and has no app or windows of its own to cover
    if (isAppExtension()) return kOff;

    BOOL on = ![mode isEqualToString:kOff];
    void (^apply)(void) = ^{
        gOn = on;
        if (on)
        {
            startObserving();
        }
        else
        {
            stopObserving();
            removeCovers();
        }
    };
    if (NSThread.isMainThread) apply();
    else dispatch_async(dispatch_get_main_queue(), apply);

    BunnyLog(@"Screen privacy: %@", mode);
    return mode;
}
