// A stand-in for Discord that the simulator test (run.sh) loads the tweak into: the classes the tweak hooks and reads,
// and a real Hermes runtime, which it hands to RCTHost's instance:didInitializeRuntime: as Discord's React Native does.
// Each launch runs one scenario (--scenario=<name>, which run.sh prepares the app's files and the server for) and
// prints "RESULT PASS|FAIL <scenario> <check>: <detail>" lines, then "DONE <scenario>".

#import <ReplayKit/ReplayKit.h>
#import <UIKit/UIKit.h>
#import <dlfcn.h>
#import <objc/message.h>
#import <objc/runtime.h>

#include <hermes/hermes.h>
#include <jsi/jsi.h>

using namespace facebook;

static NSString *scenario = @"";
static int failures = 0;

static void check(NSString *name, BOOL ok, NSString *detail)
{
    printf("RESULT %s %s %s: %s\n", ok ? "PASS" : "FAIL", scenario.UTF8String, name.UTF8String,
           (detail ?: @"").UTF8String);
    fflush(stdout);
    if (!ok) failures++;
}

static void finish(void)
{
    printf("DONE %s failures=%d\n", scenario.UTF8String, failures);
    fflush(stdout);
    exit(0);
}

// What Discord has
@interface RCTHost : NSObject
- (void)instance:(id)instance didInitializeRuntime:(jsi::Runtime &)runtime;
@end

@implementation RCTHost
- (void)instance:(id)instance didInitializeRuntime:(jsi::Runtime &)runtime
{
    // As React Native: the globals it sets up before Discord's bundle
    runtime.global().setProperty(runtime, "__HOST_ORIG__", true);
    runtime.global().setProperty(runtime, "nativeModuleProxy", jsi::Object(runtime));
}
@end

@interface DCDTheme : NSObject
@end
@implementation DCDTheme
+ (NSInteger)themeIndex { return 0; }
@end

@interface DCDThemeColor : NSObject
@end
@implementation DCDThemeColor
+ (UIColor *)backgroundPrimary { return UIColor.redColor; }
+ (UIColor *)textNormal { return UIColor.greenColor; }
+ (UIColor *)headerPrimary { return UIColor.blueColor; }
@end

static NSString *hexOf(UIColor *color)
{
    CGFloat r = 0, g = 0, b = 0, a = 0;
    if (![color getRed:&r green:&g blue:&b alpha:&a]) return @"?";
    return [NSString stringWithFormat:@"#%02x%02x%02x%02x", (int)lround(r * 255), (int)lround(g * 255),
                                      (int)lround(b * 255), (int)lround(a * 255)];
}

static NSURL *documents(void)
{
    return [NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].lastObject;
}

static NSURL *caches(void)
{
    return [NSFileManager.defaultManager URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].lastObject;
}

static NSString *stringProperty(jsi::Runtime &rt, const jsi::Object &object, const char *name)
{
    jsi::Value value = object.getProperty(rt, name);
    if (value.isString()) return [NSString stringWithUTF8String:value.getString(rt).utf8(rt).c_str()];
    if (value.isUndefined()) return @"undefined";
    if (value.isNull()) return @"null";
    if (value.isBool()) return value.getBool() ? @"true" : @"false";
    if (value.isNumber()) return [NSString stringWithFormat:@"%g", value.getNumber()];
    return @"object";
}

static jsi::Object loaderPayload(jsi::Runtime &rt, const char *method, jsi::Array args)
{
    jsi::Object call(rt);
    call.setProperty(rt, "method", jsi::String::createFromUtf8(rt, method));
    call.setProperty(rt, "args", args);
    jsi::Object payload(rt);
    payload.setProperty(rt, "revenge", call);
    return payload;
}

static NSString *savedSource(void)
{
    NSURL *file = [caches() URLByAppendingPathComponent:@"pyoncord/etag.txt"];
    return [NSString stringWithContentsOfURL:file encoding:NSUTF8StringEncoding error:nil] ?: @"";
}

static BOOL savedBundleContains(NSString *marker)
{
    NSData *data = [NSData dataWithContentsOfURL:[caches() URLByAppendingPathComponent:@"pyoncord/bundle.js"]];
    return data && [data rangeOfData:[marker dataUsingEncoding:NSUTF8StringEncoding] options:0
                               range:NSMakeRange(0, data.length)].location != NSNotFound;
}

/** The alert on screen, if any */
static UIAlertController *shownAlert(void)
{
    for (UIWindow *window in UIApplication.sharedApplication.windows)
    {
        UIViewController *top = window.rootViewController;
        while (top.presentedViewController) top = top.presentedViewController;
        if ([top isKindOfClass:UIAlertController.class]) return (UIAlertController *)top;
    }
    return nil;
}

static void checkLoaderAndBridge(jsi::Runtime &rt)
{
    jsi::Value loaderValue = rt.global().getProperty(rt, "__PYON_LOADER__");
    if (!loaderValue.isObject())
    {
        check(@"loader-identity", NO, @"__PYON_LOADER__ isn't set");
        return;
    }
    jsi::Object loader = loaderValue.asObject(rt);
    NSString *identity = [NSString stringWithFormat:@"%@ %@ themes=%@ fontPatch=%@ storedTheme=%@",
                                                    stringProperty(rt, loader, "loaderName"),
                                                    stringProperty(rt, loader, "loaderVersion"),
                                                    stringProperty(rt, loader, "hasThemeSupport"),
                                                    stringProperty(rt, loader, "fontPatch"),
                                                    stringProperty(rt, loader, "storedTheme")];
    check(@"loader-identity",
          [stringProperty(rt, loader, "loaderName") isEqualToString:@"EndcordTweak"] &&
              [stringProperty(rt, loader, "hasThemeSupport") isEqualToString:@"true"] &&
              [stringProperty(rt, loader, "fontPatch") isEqualToString:@"2"],
          identity);

    // The synchronous bridge
    try
    {
        jsi::Function call = rt.global().getPropertyAsFunction(rt, "__ENDCORD_LOADER_CALL__");
        jsi::Object response = call.call(rt, loaderPayload(rt, "revenge.info", jsi::Array(rt, 0))).asObject(rt);
        jsi::Object result = response.getProperty(rt, "result").asObject(rt);
        check(@"bridge-sync", [stringProperty(rt, result, "name") isEqualToString:@"EndcordTweak"],
              [NSString stringWithFormat:@"revenge.info = %@ %@", stringProperty(rt, result, "name"),
                                         stringProperty(rt, result, "version")]);

        jsi::Object missing = call.call(rt, loaderPayload(rt, "revenge.nope", jsi::Array(rt, 0))).asObject(rt);
        check(@"bridge-unknown-method", [stringProperty(rt, missing, "error") hasPrefix:@"Method not implemented"],
              stringProperty(rt, missing, "error"));

        // SmoothType's, with the arguments the plugin gives
        jsi::Array caretArgs(rt, 4);
        caretArgs.setValueAtIndex(rt, 0, false);
        caretArgs.setValueAtIndex(rt, 1, 0xffffff);
        caretArgs.setValueAtIndex(rt, 2, 60);
        caretArgs.setValueAtIndex(rt, 3, jsi::String::createFromAscii(rt, "ease"));
        jsi::Object caret = call.call(rt, loaderPayload(rt, "endcord.smoothType.configure", std::move(caretArgs))).asObject(rt);
        check(@"bridge-smooth-type", !caret.hasProperty(rt, "error") && caret.hasProperty(rt, "result"),
              stringProperty(rt, caret, "error"));

        BOOL threw = NO;
        try { call.call(rt); } catch (const jsi::JSError &e) { threw = YES; }
        check(@"bridge-no-payload-throws", threw, @"");

        // An object that holds itself: an error, not a stack overflow
        jsi::Object cyclic(rt);
        cyclic.setProperty(rt, "self", cyclic);
        jsi::Array args(rt, 1);
        args.setValueAtIndex(rt, 0, cyclic);
        threw = NO;
        NSString *message = @"";
        try { call.call(rt, loaderPayload(rt, "revenge.info", std::move(args))); }
        catch (const jsi::JSError &e) { threw = YES; message = [NSString stringWithUTF8String:e.getMessage().c_str()]; }
        check(@"bridge-cyclic-args", threw, message);
    }
    catch (const std::exception &e)
    {
        check(@"bridge-sync", NO, [NSString stringWithUTF8String:e.what()]);
    }

    // The asynchronous one: a promise of the same answer
    try
    {
        jsi::Function call = rt.global().getPropertyAsFunction(rt, "__ENDCORD_LOADER_CALL_ASYNC__");
        jsi::Object promise = call.call(rt, loaderPayload(rt, "revenge.info", jsi::Array(rt, 0))).asObject(rt);
        auto answer = std::make_shared<std::string>("(not resolved)");
        jsi::Function then = promise.getPropertyAsFunction(rt, "then");
        then.callWithThis(rt, promise, jsi::Function::createFromHostFunction(
            rt, jsi::PropNameID::forAscii(rt, "onResolved"), 1,
            [answer](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) {
                if (count && args[0].isObject())
                {
                    jsi::Value result = args[0].asObject(rt).getProperty(rt, "result");
                    if (result.isObject()) *answer = result.asObject(rt).getProperty(rt, "name").toString(rt).utf8(rt);
                }
                return jsi::Value::undefined();
            }));
        rt.drainMicrotasks();
        check(@"bridge-async", *answer == "EndcordTweak", [NSString stringWithUTF8String:answer->c_str()]);
    }
    catch (const std::exception &e)
    {
        check(@"bridge-async", NO, [NSString stringWithUTF8String:e.what()]);
    }

    check(@"discord-init-ran", rt.global().getProperty(rt, "__HOST_ORIG__").isBool(), @"%orig before Endcord");
}

static void checkSideloading(void)
{
    NSString *seen = NSBundle.mainBundle.bundleIdentifier;
    check(@"sideloading-bundle-id", [seen isEqualToString:@"com.hammerandchisel.discord"],
          [NSString stringWithFormat:@"Discord's code sees %@", seen]);
    NSString *info = [NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleIdentifier"];
    check(@"sideloading-info", [info isEqualToString:@"com.hammerandchisel.discord"], info);
    NSURL *group = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:@"group.test"];
    BOOL isFolder = NO;
    check(@"sideloading-app-group", [NSFileManager.defaultManager fileExistsAtPath:group.path isDirectory:&isFolder] && isFolder,
          group.path);
}

/** Discord picks its screen share extension by the bundle ID it's told; the picker gets this app's own */
static void checkBroadcast(void)
{
    NSString *seen = NSBundle.mainBundle.bundleIdentifier;
    RPSystemBroadcastPickerView *picker = [[RPSystemBroadcastPickerView alloc] initWithFrame:CGRectMake(0, 0, 44, 44)];
    picker.preferredExtension = [seen stringByAppendingString:@".BroadcastUpload"];
    NSString *real = (__bridge NSString *)CFBundleGetIdentifier(CFBundleGetMainBundle());
    check(@"broadcast-extension", [picker.preferredExtension isEqualToString:[real stringByAppendingString:@".BroadcastUpload"]],
          [NSString stringWithFormat:@"told %@, picks %@", seen, picker.preferredExtension]);
    picker.preferredExtension = @"com.example.Other";
    check(@"broadcast-other-untouched", [picker.preferredExtension isEqualToString:@"com.example.Other"], picker.preferredExtension);
    finish();
}

// Discord's message box: a text view, and its native component a subclass of it. It gives no caret rect while its
// cursor shouldn't show.
@interface DCDChatInput : UITextView
@property (nonatomic, assign) BOOL shouldShowCursor;
@end
@implementation DCDChatInput
- (CGRect)caretRectForPosition:(UITextPosition *)position
{
    return self.shouldShowCursor ? [super caretRectForPosition:position] : CGRectZero;
}
@end
@interface DCDChatInputComponentView : DCDChatInput
@end
@implementation DCDChatInputComponentView
@end

static void findViews(UIView *view, NSString *className, NSMutableArray *found)
{
    if ([NSStringFromClass(view.class) isEqualToString:className]) [found addObject:view];
    for (UIView *subview in view.subviews) findViews(subview, className, found);
}

static NSString *describeInteractions(UIView *view, NSInteger depth)
{
    NSMutableArray *parts = [NSMutableArray array];
    for (id interaction in view.interactions) [parts addObject:NSStringFromClass([interaction class])];
    if (depth > 0)
        for (UIView *subview in view.subviews) [parts addObject:describeInteractions(subview, depth - 1)];
    return [NSString stringWithFormat:@"%@[%@]", NSStringFromClass(view.class), [parts componentsJoinedByString:@" "]];
}

/** SmoothType's caret, on a message box and not on another text view */
static void checkSmoothCaret(UIViewController *root)
{
    void (*configure)(NSArray *) = (void (*)(NSArray *))dlsym(RTLD_DEFAULT, "configureSmoothCaret");
    check(@"caret-configure", configure != NULL, @"");
    if (!configure) return finish();

    DCDChatInputComponentView *input = [[DCDChatInputComponentView alloc] initWithFrame:CGRectMake(16, 120, 340, 120)];
    input.shouldShowCursor = YES;
    input.font = [UIFont systemFontOfSize:22];
    input.text = @"Hello";
    [root.view addSubview:input];
    UITextView *other = [[UITextView alloc] initWithFrame:CGRectMake(16, 300, 340, 120)];
    other.font = [UIFont systemFontOfSize:22];
    other.text = @"Not the message box";
    [root.view addSubview:other];

    // On before the box is focused, as when Discord starts with SmoothType on
    configure(@[ @YES, @0xff0000, @400, @"linear" ]);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [input becomeFirstResponder];
    });

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        printf("INFO interactions %s\n", describeInteractions(input, 3).UTF8String);
        for (id interaction in input.interactions)
            if ([NSStringFromClass([interaction class]) isEqualToString:@"UITextSelectionDisplayInteraction"])
                printf("INFO cursorView %s\n", NSStringFromClass([[interaction valueForKey:@"cursorView"] class]).UTF8String);
        NSMutableArray *carets = [NSMutableArray array];
        findViews(root.view, @"EndcordCaretView", carets);
        UIView *caret = carets.firstObject;
        NSMutableArray *glyphs = [NSMutableArray array];
        findViews(root.view, @"EndcordCaretGlyph", glyphs);
        UIView *glyph = glyphs.firstObject;
        check(@"caret-in-message-box", caret && caret.window && [caret isDescendantOfView:input],
              caret ? [NSString stringWithFormat:@"%@ in %@", NSStringFromCGRect(caret.frame), NSStringFromClass(caret.superview.class)]
                    : describeInteractions(input, 3));
        check(@"caret-color", glyph && [hexOf(glyph.backgroundColor) isEqualToString:@"#ff0000ff"],
              glyph ? hexOf(glyph.backgroundColor) : @"no glyph");
        check(@"caret-where-cursor-is", glyph && !glyph.hidden && CGRectEqualToRect(glyph.frame, caret.frame),
              [NSString stringWithFormat:@"%@, cursor %@", NSStringFromCGRect(glyph.frame), NSStringFromCGRect(caret.frame)]);
        check(@"caret-is-cursor", caret && [caret conformsToProtocol:objc_getProtocol("UITextCursorView")], @"");

        // Typing moves it: it glides there over the transition delay
        CGPoint before = glyph.layer.position;
        [input insertText:@" world, and more"];
        [input layoutIfNeeded];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            CALayer *shown = glyph.layer.presentationLayer;
            CGPoint target = glyph.layer.position;
            BOOL moved = !CGPointEqualToPoint(before, target);
            BOOL midway = shown && fabs(shown.position.x - target.x) > 1 && fabs(shown.position.x - before.x) > 1;
            check(@"caret-glides", moved && midway,
                  [NSString stringWithFormat:@"from %@ to %@, on screen %@, animations %@", NSStringFromCGPoint(before),
                                             NSStringFromCGPoint(target), NSStringFromCGPoint(shown.position),
                                             [glyph.layer.animationKeys componentsJoinedByString:@" "]]);
            printf("SCREENSHOT %s\n", scenario.UTF8String);
            fflush(stdout);

            // Long enough for run.sh's screenshot, which is slow on a busy runner
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                // Another text view keeps the system's cursor
                [other becomeFirstResponder];
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                    NSMutableArray *otherCarets = [NSMutableArray array];
                    findViews(other, @"EndcordCaretView", otherCarets);
                    check(@"caret-only-message-box", otherCarets.count == 0, @"");

                    // Turned off, the message box gets the system's back
                    configure(@[ @NO, @0xff0000, @400, @"linear" ]);
                    [input becomeFirstResponder];
                    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                        NSMutableArray *left = [NSMutableArray array];
                        findViews(root.view, @"EndcordCaretView", left);
                        findViews(root.view, @"EndcordCaretGlyph", left);
                        BOOL gone = YES;
                        for (UIView *view in left) if (view.window) gone = NO;
                        check(@"caret-off", gone, [NSString stringWithFormat:@"%lu left", (unsigned long)left.count]);
                        finish();
                    });
                });
            });
        });
    });
}

/** The app group: the signed one, with what the stand-in folder had moved into it */
static void checkAppGroup(void)
{
    NSFileManager *fm = NSFileManager.defaultManager;
    NSURL *standIn = [documents() URLByAppendingPathComponent:@"AppGroup"];
    [fm createDirectoryAtURL:standIn withIntermediateDirectories:YES attributes:nil error:nil];
    [@"kept" writeToURL:[standIn URLByAppendingPathComponent:@"marker.txt"] atomically:YES encoding:NSUTF8StringEncoding error:nil];

    NSURL *group = [fm containerURLForSecurityApplicationGroupIdentifier:@"group.com.hammerandchisel.discord"];
    check(@"app-group-signed", group && ![group.path hasPrefix:documents().path], group.path ?: @"nil");
    NSString *marker = [NSString stringWithContentsOfURL:[group URLByAppendingPathComponent:@"marker.txt"]
                                                encoding:NSUTF8StringEncoding error:nil];
    check(@"app-group-moved", [marker isEqualToString:@"kept"], marker ?: @"not moved");
    finish();
}

static void checkTheme(jsi::Runtime &rt)
{
    check(@"theme-semantic", [hexOf([DCDThemeColor backgroundPrimary]) isEqualToString:@"#112233ff"],
          hexOf([DCDThemeColor backgroundPrimary]));
    // false, the bundle's value for a color it couldn't read, leaves Discord's
    check(@"theme-semantic-false", [hexOf([DCDThemeColor textNormal]) isEqualToString:hexOf(UIColor.greenColor)],
          hexOf([DCDThemeColor textNormal]));
    check(@"theme-semantic-short", [hexOf([DCDThemeColor headerPrimary]) isEqualToString:@"#aabbccff"],
          hexOf([DCDThemeColor headerPrimary]));

    SEL raw = NSSelectorFromString(@"PRIMARY_500");
    BOOL hasRaw = [UIColor respondsToSelector:raw];
    UIColor *rawColor = hasRaw ? ((UIColor * (*)(id, SEL))objc_msgSend)(UIColor.class, raw) : nil;
    check(@"theme-raw", [hexOf(rawColor) isEqualToString:@"#abcdefff"], hasRaw ? hexOf(rawColor) : @"no method");

    // A theme's keys that are other methods are left alone
    NSObject *object = [NSObject new];
    check(@"theme-raw-alloc-untouched", [object isMemberOfClass:NSObject.class], NSStringFromClass(object.class));
    UIColor *made = [UIColor colorWithRed:0 green:0 blue:1 alpha:1];
    check(@"theme-raw-args-untouched", [hexOf(made) isEqualToString:@"#0000ffff"], hexOf(made));
    check(@"theme-raw-lowercase-untouched", [hexOf(UIColor.blackColor) isEqualToString:@"#000000ff"],
          hexOf(UIColor.blackColor));

    jsi::Object loader = rt.global().getProperty(rt, "__PYON_LOADER__").asObject(rt);
    jsi::Value stored = loader.getProperty(rt, "storedTheme");
    check(@"theme-stored", stored.isObject() && [stringProperty(rt, stored.asObject(rt), "id") isEqualToString:@"test-theme"],
          stored.isObject() ? stringProperty(rt, stored.asObject(rt), "id") : @"not an object");
}

static void runScenario(jsi::Runtime &rt)
{
    [[RCTHost new] instance:nil didInitializeRuntime:rt];

    jsi::Value marker = rt.global().getProperty(rt, "__TEST_BUNDLE__");
    NSString *bundle = marker.isString() ? [NSString stringWithUTF8String:marker.getString(rt).utf8(rt).c_str()] : @"none";
    NSDictionary *expected = @{
        @"first-start" : @"hbc",
        @"cached-start" : @"hbc",
        @"update-old" : @"hbc",
        @"update-new" : @"hbc2",
        @"fallback-js" : @"js",
        @"wrong-bytecode" : @"js",
        @"saved-wrong-version" : @"hbc2",
        @"offline-backup" : @"hbc2",
        @"offline-nothing" : @"none",
        @"custom-url" : @"custom",
        @"custom-off" : @"hbc2",
        @"broken-files" : @"hbc2",
        @"theme" : @"hbc2",
        @"fonts" : @"hbc2",
        @"bundle-throws" : @"throws",
        @"signed-start" : @"hbc2",
        @"signed-tampered-cache" : @"hbc2",
        @"signed-tampered-download" : @"none",
        @"signed-forged" : @"none",
        @"signed-newer" : @"hbc2",
        @"signed-rollback" : @"hbc2",
        @"signed-rollback-empty" : @"none",
        @"signed-required-missing" : @"none",
        @"signed-required" : @"hbc2",
        @"signed-required-unsigned-cache" : @"hbc2",
    };
    if (expected[scenario])
    {
        check(@"bundle", [bundle isEqualToString:expected[scenario]],
              [NSString stringWithFormat:@"ran %@, saved from %@", bundle,
                                         [savedSource() stringByReplacingOccurrencesOfString:@"\n" withString:@" | "]]);
    }

    if ([scenario isEqualToString:@"first-start"])
    {
        NSArray *lines = [savedSource() componentsSeparatedByString:@"\n"];
        check(@"saved-source", [lines.firstObject hasSuffix:@".hbc"] && lines.count == 2 && [lines[1] length] > 0,
              savedSource());
        checkLoaderAndBridge(rt);
    }
    if ([scenario isEqualToString:@"fallback-js"])
    {
        check(@"saved-source", [savedSource() hasPrefix:@"http://127.0.0.1:4040/endcord.min.js"], savedSource());
    }
    if ([scenario isEqualToString:@"custom-url"])
    {
        check(@"saved-source", [savedSource() hasPrefix:@"http://127.0.0.1:4040/custom.js"], savedSource());
    }
    if ([scenario isEqualToString:@"offline-backup"])
    {
        BOOL backup = [NSFileManager.defaultManager
            fileExistsAtPath:[caches() URLByAppendingPathComponent:@"pyoncord/bundle.js.backup"].path];
        check(@"backup-restored", !backup && savedBundleContains(@"hbc2"), backup ? @"backup still there" : @"");
    }
    if ([scenario isEqualToString:@"broken-files"])
    {
        NSFileManager *fm = NSFileManager.defaultManager;
        NSArray *outside = @[ @"pyoncord/x", @"evil.ttf", @"pyoncord/evil.ttf", @"pyoncord/downloads/evil.ttf" ];
        NSMutableArray *found = [NSMutableArray array];
        for (NSString *path in outside)
            if ([fm fileExistsAtPath:[documents() URLByAppendingPathComponent:path].path]) [found addObject:path];
        check(@"font-paths-contained", found.count == 0, [found componentsJoinedByString:@", "]);
        checkLoaderAndBridge(rt);
    }
    if ([scenario isEqualToString:@"theme"]) checkTheme(rt);
    if ([scenario isEqualToString:@"fonts"])
    {
        // run.sh saves a font of the Mac's as the font's file, and its PostScript name
        NSString *expectedName = [[NSString stringWithContentsOfURL:[documents() URLByAppendingPathComponent:@"expected-font.txt"]
                                                           encoding:NSUTF8StringEncoding
                                                              error:nil]
            stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        UIFont *font = [UIFont fontWithName:@"ggsans-Normal" size:14];
        check(@"font-replaced", [font.fontName isEqualToString:expectedName],
              [NSString stringWithFormat:@"%@ (%@), expected %@", font.fontName, font.familyName, expectedName]);
    }
    if ([scenario isEqualToString:@"real-bundle"])
    {
        jsi::Value timings = rt.global().getProperty(rt, "__ENDCORD_TIMINGS__");
        check(@"real-bundle-ran", timings.isObject(), @"the published bytecode ran its top level");
        check(@"real-bundle-waits-for-discord", rt.global().hasProperty(rt, "__r"),
              @"it set up the hook for Discord's modules");
    }

    if ([scenario isEqualToString:@"first-start"]) checkSideloading();

    // What happens a moment later: the background update, an alert
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(4 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        UIAlertController *alert = shownAlert();
        NSArray *refused = @[ @"signed-tampered-download", @"signed-forged", @"signed-rollback-empty" ];
        if ([refused containsObject:scenario])
        {
            check(@"alert", [alert.message containsString:@"security check"], alert.message ?: @"no alert");
        }
        else if ([scenario isEqualToString:@"offline-nothing"] || [scenario isEqualToString:@"signed-required-missing"])
        {
            check(@"alert", [alert.title isEqualToString:@"Endcord couldn't load"], alert.title ?: @"no alert");
        }
        else if ([scenario isEqualToString:@"bundle-throws"])
        {
            check(@"alert", [alert.title isEqualToString:@"Endcord couldn't start"] &&
                                [alert.message containsString:@"boom"],
                  [NSString stringWithFormat:@"%@: %@", alert.title, alert.message]);
        }
        else
        {
            check(@"no-alert", alert == nil, alert ? [NSString stringWithFormat:@"%@: %@", alert.title, alert.message] : @"");
        }
        if ([scenario isEqualToString:@"signed-rollback"])
        {
            check(@"rollback-refused", savedBundleContains(@"hbc2"), @"the older release didn't replace the saved bundle");
        }
        if ([scenario isEqualToString:@"update-old"])
        {
            check(@"background-update", savedBundleContains(@"hbc2"), @"the new bundle is saved for the next start");
        }
        // run.sh takes a screenshot now
        printf("SCREENSHOT %s\n", scenario.UTF8String);
        fflush(stdout);
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            finish();
        });
    });
}

@interface HostDelegate : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation HostDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    UIViewController *root = [UIViewController new];
    root.view.backgroundColor = UIColor.systemBackgroundColor;
    UILabel *label = [UILabel new];
    label.text = [NSString stringWithFormat:@"Endcord test host\n%@", scenario];
    label.numberOfLines = 0;
    label.textAlignment = NSTextAlignmentCenter;
    label.frame = root.view.bounds;
    label.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [root.view addSubview:label];
    self.window.rootViewController = root;
    [self.window makeKeyAndVisible];

    if ([scenario hasPrefix:@"safe-mode"])
    {
        // The recovery menu's toggle, which closes the app; run.sh checks the files it leaves
        void (*toggle)(void) = (void (*)(void))dlsym(RTLD_DEFAULT, "toggleSafeMode");
        printf("DONE %s failures=%d\n", scenario.UTF8String, toggle ? 0 : 1);
        fflush(stdout);
        if (toggle) toggle();
        return YES;
    }
    if ([scenario isEqualToString:@"delete-data"])
    {
        // The recovery menu's Delete All Plugins and Delete All Themes, without the app closing after them
        void (*deletePlugins)(void) = (void (*)(void))dlsym(RTLD_DEFAULT, "deletePlugins");
        void (*deleteThemes)(void) = (void (*)(void))dlsym(RTLD_DEFAULT, "deleteThemes");
        if (deletePlugins) deletePlugins();
        if (deleteThemes) deleteThemes();
        check(@"delete-functions", deletePlugins && deleteThemes, @"");
        finish();
    }
    if ([scenario isEqualToString:@"smooth-caret"])
    {
        checkSmoothCaret(root);
        return YES;
    }
    if ([scenario isEqualToString:@"app-group"])
    {
        checkAppGroup();
        return YES;
    }
    if ([scenario isEqualToString:@"broadcast"])
    {
        checkBroadcast();
        return YES;
    }
    if ([scenario isEqualToString:@"menu"])
    {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            void (*show)(void) = (void (*)(void))dlsym(RTLD_DEFAULT, "showSettingsSheet");
            if (show) show();
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                UIViewController *top = self.window.rootViewController.presentedViewController;
                UIViewController *menu = [top isKindOfClass:UINavigationController.class]
                                             ? ((UINavigationController *)top).viewControllers.firstObject
                                             : nil;
                check(@"recovery-menu", [NSStringFromClass(menu.class) isEqualToString:@"BunnySettingsViewController"],
                      menu.title ?: NSStringFromClass(top.class));
                printf("SCREENSHOT %s\n", scenario.UTF8String);
                fflush(stdout);
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2 * NSEC_PER_SEC)),
                               dispatch_get_main_queue(), ^{ finish(); });
            });
        });
        return YES;
    }

    // React Native's JavaScript thread, with a stack as big
    NSThread *js = [[NSThread alloc] initWithBlock:^{
        // With the microtask queue, as React Native makes it
        static std::unique_ptr<jsi::Runtime> runtime =
            facebook::hermes::makeHermesRuntime(::hermes::vm::RuntimeConfig::Builder().withMicrotaskQueue(true).build());
        try
        {
            runScenario(*runtime);
        }
        catch (const std::exception &e)
        {
            check(@"no-exception", NO, [NSString stringWithUTF8String:e.what()]);
            finish();
        }
        [[NSRunLoop currentRunLoop] run];
    }];
    js.stackSize = 8 * 1024 * 1024;
    js.name = @"com.facebook.react.JavaScript";
    [js start];
    return YES;
}

@end

int main(int argc, char *argv[])
{
    @autoreleasepool
    {
        for (int i = 1; i < argc; i++)
        {
            NSString *arg = [NSString stringWithUTF8String:argv[i]];
            if ([arg hasPrefix:@"--scenario="]) scenario = [arg substringFromIndex:11];
        }
        // As if Discord had been injected with it: before the app starts
        NSString *tweak = [NSBundle.mainBundle.privateFrameworksPath stringByAppendingPathComponent:@"Endcord.dylib"];
        if (!dlopen(tweak.fileSystemRepresentation, RTLD_NOW))
        {
            printf("RESULT FAIL %s load-tweak: %s\nDONE %s failures=1\n", scenario.UTF8String, dlerror(),
                   scenario.UTF8String);
            return 1;
        }
        return UIApplicationMain(argc, argv, nil, NSStringFromClass(HostDelegate.class));
    }
}
