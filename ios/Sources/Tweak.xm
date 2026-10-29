#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <jsi/jsi.h>
#import <functional>
#import <unistd.h>
#import <objc/runtime.h>
#import <stdlib.h>

#import "LoaderConfig.h"
#import "Logger.h"
#import "Utils.h"
#import "JSI.h"
#import "RCTHost.h"
#import "RCTInstance.h"
#import "Fonts.h"
#import "Settings.h"
#import "SmoothCaret.h"
#import "Themes.h"

using namespace facebook;

#define LOADER_NAME @"EndcordTweak"
// The published bundle; endcord.v<version>.hbc next to it is the same bundle precompiled for that Hermes bytecode
// version. A test build sets its own (ENDCORD_BUNDLE_URL in the Makefile).
#ifdef ENDCORD_BUNDLE_URL
#define BUNDLE_URL ENDCORD_BUNDLE_URL
#else
#define BUNDLE_URL @"https://raw.githubusercontent.com/Endcord/endcord-mobile/builds-next/endcord.min.js"
#endif

static LoaderConfig  *loaderConfig;
static NSTimeInterval shakeStartTime = 0;
static BOOL           isShaking      = NO;

static dispatch_queue_t fsQueue(void)
{
    static dispatch_queue_t queue;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        queue = dispatch_queue_create("com.endcord.tweak.fsQueue", DISPATCH_QUEUE_SERIAL);
    });
    return queue;
}

/** The bytecode version of Discord's own bundle, which a precompiled bundle has to match; 0 when it isn't bytecode */
static uint32_t discordBytecodeVersion(void)
{
    static uint32_t version;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        NSString *path = [[NSBundle mainBundle] pathForResource:@"main" ofType:@"jsbundle"];
        NSFileHandle *file = path ? [NSFileHandle fileHandleForReadingAtPath:path] : nil;
        version = hermesBytecodeVersion([file readDataOfLength:12]);
        [file closeFile];
        BunnyLog(@"Discord's bundle has bytecode version %u", version);
    });
    return version;
}

/**
 * Where to fetch the bundle from, in order: a custom URL alone, or else the bundle precompiled for this Discord's
 * bytecode version and then the plain JS one, for versions no precompiled bundle is published for
 */
static NSArray<NSURL *> *bundleURLs(void)
{
    LoaderConfig *config = [LoaderConfig getLoaderConfig];
    if (config.customLoadUrlEnabled && config.customLoadUrl)
    {
        return @[ config.customLoadUrl ];
    }

    NSURL *plain = [NSURL URLWithString:BUNDLE_URL];
    uint32_t version = discordBytecodeVersion();
    if (!version) return @[ plain ];

    NSString *name = [NSString stringWithFormat:@"endcord.v%u.hbc", version];
    return @[ [[plain URLByDeletingLastPathComponent] URLByAppendingPathComponent:name], plain ];
}

/** Whether a bundle can run in this Discord: plain JS always can, bytecode only on the version it was compiled for */
static BOOL canRunBundle(NSData *bundle, NSString *source)
{
    uint32_t version = hermesBytecodeVersion(bundle);
    if (version && version != discordBytecodeVersion())
    {
        BunnyLog(@"The bundle from %@ is bytecode version %u, Discord's is %u", source, version, discordBytecodeVersion());
        return NO;
    }
    return YES;
}

/** The URL the saved bundle came from and, when the server sent one, its ETag: saved as two lines */
static NSArray<NSString *> *savedBundleSource(void)
{
    __block NSString *saved;
    dispatch_sync(fsQueue(), ^{
        saved = [NSString stringWithContentsOfURL:getBundleETagURL() encoding:NSUTF8StringEncoding error:nil];
    });
    NSArray<NSString *> *lines = [saved componentsSeparatedByString:@"\n"];
    if (lines.count == 0 || lines[0].length == 0) return nil;
    return @[ lines[0], lines.count >= 2 ? lines[1] : @"" ];
}

/**
 * The saved bundle, if this Discord can run it and it came from where Endcord loads from now. After Discord moves to a
 * newer Hermes, the bytecode saved for the old one is as good as missing; so is a bundle from a custom URL that has
 * been turned off since, or the other way around.
 */
static NSData *usableSavedBundle(void)
{
    __block NSData *bundle;
    dispatch_sync(fsQueue(), ^{ bundle = [NSData dataWithContentsOfURL:getBundleURL()]; });
    if (bundle.length == 0) return nil;

    NSString *source = savedBundleSource()[0];
    if (source && ![[bundleURLs() valueForKey:@"absoluteString"] containsObject:source])
    {
        BunnyLog(@"The saved bundle is from %@, which Endcord doesn't load from now", source);
        return nil;
    }
    return canRunBundle(bundle, source ?: @"the saved bundle") ? bundle : nil;
}

/**
 * Downloads the bundle and saves it, trying each of bundleURLs() until one has it. Returns the bundle to run: the
 * new one, the saved one when the server says it's unchanged, or nil when none could be fetched.
 */
static NSData *fetchBundle(NSTimeInterval timeout)
{
    NSData *saved = usableSavedBundle();
    NSArray<NSString *> *etag = saved ? savedBundleSource() : nil;
    NSURLSession *session = [NSURLSession sessionWithConfiguration:NSURLSessionConfiguration.ephemeralSessionConfiguration];
    NSData *result = nil;

    for (NSURL *url in bundleURLs())
    {
        NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url
                                                               cachePolicy:NSURLRequestReloadIgnoringLocalAndRemoteCacheData
                                                           timeoutInterval:timeout];
        if (etag[1].length && [etag[0] isEqualToString:url.absoluteString])
        {
            [request setValue:etag[1] forHTTPHeaderField:@"If-None-Match"];
        }

        __block NSData *data;
        __block NSHTTPURLResponse *response;
        __block NSError *error;
        dispatch_semaphore_t done = dispatch_semaphore_create(0);
        [[session dataTaskWithRequest:request
                    completionHandler:^(NSData *d, NSURLResponse *r, NSError *e) {
            data = d;
            response = [r isKindOfClass:NSHTTPURLResponse.class] ? (NSHTTPURLResponse *)r : nil;
            error = e;
            dispatch_semaphore_signal(done);
        }] resume];
        dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);

        if (response.statusCode == 304 && saved)
        {
            BunnyLog(@"The bundle at %@ hasn't changed", url);
            result = saved;
            break;
        }
        // A custom URL can serve bytecode for another Hermes, which is as good as nothing
        if (response.statusCode == 200 && data.length > 0 && canRunBundle(data, url.absoluteString))
        {
            BunnyLog(@"Downloaded the bundle from %@ (%lu bytes)", url, (unsigned long)data.length);
            NSString *newETag = [response valueForHTTPHeaderField:@"ETag"] ?: @"";
            dispatch_sync(fsQueue(), ^{
                [data writeToURL:getBundleURL() atomically:YES];
                NSString *lines = [NSString stringWithFormat:@"%@\n%@", url.absoluteString, newETag];
                [lines writeToURL:getBundleETagURL() atomically:YES encoding:NSUTF8StringEncoding error:nil];
            });
            cleanupBundleBackup();
            result = data;
            break;
        }
        // A missing precompiled bundle falls back to the plain one; so does any other failure, which it may not have
        if (!(response.statusCode == 200 && data.length > 0))
        {
            BunnyLog(@"Couldn't download the bundle from %@: %@", url,
                     error ? error.localizedDescription : [NSString stringWithFormat:@"HTTP %ld", (long)response.statusCode]);
        }
    }

    [session finishTasksAndInvalidate];
    return result;
}

typedef id (^BridgeHandler)(NSArray *args);

/** The methods the bundle calls through callLoaderMethod(), as on the Android loader */
static NSDictionary<NSString *, BridgeHandler> *bridgeHandlers(void)
{
    static NSDictionary<NSString *, BridgeHandler> *handlers;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        handlers = @{
            @"revenge.info": ^id(NSArray *args) {
                return @{ @"name": LOADER_NAME, @"version": PACKAGE_VERSION };
            },
            @"endcord.smoothType.configure": ^id(NSArray *args) {
                configureSmoothCaret(args);
                return nil;
            },
        };
    });
    return handlers;
}

static NSDictionary *callBridgeMethodHelper(NSString *methodName, NSArray *args)
{
    @try {
        BridgeHandler handler = bridgeHandlers()[methodName];
        if (!handler)
        {
            return @{@"error": [NSString stringWithFormat:@"Method not implemented: %@", methodName]};
        }

        __block id handlerResult;
        dispatch_sync(fsQueue(), ^{
            handlerResult = handler(args);
        });

        id responseVal = (handlerResult == nil) ? [NSNull null] : handlerResult;
        return @{@"result": responseVal};
    }
    @catch (NSException *exception) {
        return @{@"error": exception.reason ?: @"Unknown Objective-C exception"};
    }
}

/**
 * The theme the bundle saved for the next start ({ id, selected, data }, lib/addons/themes), applied to Discord's native
 * colors before any view is drawn. No theme, which the bundle saves as {}, is null, as from the Android loader.
 */
static jsi::Value loadStoredTheme(jsi::Runtime &runtime)
{
    NSDictionary *theme = readJSONFile([getPyoncordDirectory() URLByAppendingPathComponent:@"current-theme.json"]);
    if (![theme isKindOfClass:NSDictionary.class] || ![theme[@"data"] isKindOfClass:NSDictionary.class])
        return jsi::Value::null();

    NSDictionary *data = theme[@"data"];
    initializeThemeColors(data[@"semanticColors"], data[@"rawColors"]);
    return [JSI fromObjC:theme runtime:runtime];
}

/**
 * With ENDCORD_LOG_JS set (the simulator test sets it), the bundle's console output goes to the system log too: a
 * release build of React Native drops everything below errors
 */
static void forwardConsoleIfAsked(jsi::Runtime &runtime)
{
    if (!getenv("ENDCORD_LOG_JS")) return;

    jsi::Value original = runtime.global().getProperty(runtime, "nativeLoggingHook");
    auto originalHook = std::make_shared<jsi::Value>(runtime, original);
    auto hook = jsi::Function::createFromHostFunction(
        runtime, jsi::PropNameID::forUtf8(runtime, "nativeLoggingHook"), 2,
        [originalHook](jsi::Runtime &rt, const jsi::Value &thisVal, const jsi::Value *args, size_t count) -> jsi::Value {
            if (count > 0 && args[0].isString())
            {
                NSLog(@"[Endcord JS] %@", [JSI toNSString:args[0] runtime:rt]);
            }
            if (originalHook->isObject() && originalHook->asObject(rt).isFunction(rt))
            {
                return originalHook->asObject(rt).asFunction(rt).call(rt, args, count);
            }
            return jsi::Value::undefined();
        });
    runtime.global().setProperty(runtime, "nativeLoggingHook", hook);
}

static void injectPreBundle(jsi::Runtime &runtime)
{
    try
    {
        // What the bundle reads in lib/api/native/loader.ts, as the Android loader sets it
        jsi::Object loaderObj(runtime);
        loaderObj.setProperty(runtime, "loaderName", jsi::String::createFromUtf8(runtime, [LOADER_NAME UTF8String]));
        loaderObj.setProperty(runtime, "loaderVersion", jsi::String::createFromUtf8(runtime, [PACKAGE_VERSION UTF8String]));
        loaderObj.setProperty(runtime, "hasThemeSupport", true);
        loaderObj.setProperty(runtime, "storedTheme", loadStoredTheme(runtime));
        loaderObj.setProperty(runtime, "fontPatch", 2);
        runtime.global().setProperty(runtime, "__PYON_LOADER__", loaderObj);

        // The payload is { revenge: { method, args } }, the same as the Android loader takes
        auto parsePayload = [](jsi::Runtime &rt, const jsi::Value *args, size_t count, NSString **methodOut, NSArray **argsOut) {
            if (count < 1 || !args[0].isObject()) {
                throw jsi::JSError(rt, "Expected a single payload object as argument.");
            }
            jsi::Object payload = args[0].asObject(rt);

            jsi::Value callVal = payload.getProperty(rt, "revenge");
            if (!callVal.isObject()) throw jsi::JSError(rt, "Payload missing 'revenge' object.");
            jsi::Object call = callVal.asObject(rt);

            jsi::Value methodVal = call.getProperty(rt, "method");
            if (!methodVal.isString()) throw jsi::JSError(rt, "'method' property must be a string.");
            *methodOut = [JSI toNSString:methodVal runtime:rt];

            *argsOut = @[];
            jsi::Value argsVal = call.getProperty(rt, "args");
            if (argsVal.isObject() && argsVal.asObject(rt).isArray(rt)) {
                *argsOut = [JSI toObjC:argsVal runtime:rt];
            }
        };

        auto syncCall = jsi::Function::createFromHostFunction(
            runtime,
            jsi::PropNameID::forUtf8(runtime, "__ENDCORD_LOADER_CALL__"),
            1,
            [parsePayload](jsi::Runtime &rt, const jsi::Value &thisVal, const jsi::Value *args, size_t count) -> jsi::Value {
                NSString *methodName;
                NSArray *objcArgs;
                parsePayload(rt, args, count, &methodName, &objcArgs);
                NSDictionary *res = callBridgeMethodHelper(methodName, objcArgs);
                return [JSI fromObjC:res runtime:rt];
            }
        );
        runtime.global().setProperty(runtime, "__ENDCORD_LOADER_CALL__", syncCall);

        auto asyncCall = jsi::Function::createFromHostFunction(
            runtime,
            jsi::PropNameID::forUtf8(runtime, "__ENDCORD_LOADER_CALL_ASYNC__"),
            1,
            [parsePayload](jsi::Runtime &rt, const jsi::Value &thisVal, const jsi::Value *args, size_t count) -> jsi::Value {
                NSString *methodName;
                NSArray *objcArgs;
                parsePayload(rt, args, count, &methodName, &objcArgs);

                jsi::Function promiseCtor = rt.global().getPropertyAsFunction(rt, "Promise");
                jsi::Function executor = jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forUtf8(rt, "executor"), 2,
                    [methodName, objcArgs](jsi::Runtime &innerRt, const jsi::Value &thisVal, const jsi::Value *innerArgs, size_t innerCount) -> jsi::Value {
                        jsi::Function resolve = innerArgs[0].asObject(innerRt).asFunction(innerRt);
                        NSDictionary *res = callBridgeMethodHelper(methodName, objcArgs);
                        resolve.call(innerRt, [JSI fromObjC:res runtime:innerRt]);
                        return jsi::Value::undefined();
                    });
                return promiseCtor.callAsConstructor(rt, executor);
            }
        );
        runtime.global().setProperty(runtime, "__ENDCORD_LOADER_CALL_ASYNC__", asyncCall);

    }
    catch (const jsi::JSError &e) { BunnyLog(@"injectPreBundle: JSError: %s", e.what()); }
    catch (const std::exception &e) { BunnyLog(@"injectPreBundle: exception: %s", e.what()); }
}

static void executePreloads(jsi::Runtime &runtime, NSURL *pyoncordDir)
{
    NSURL *preloadsDirectory = [pyoncordDir URLByAppendingPathComponent:@"preloads"];
    if ([[NSFileManager defaultManager] fileExistsAtPath:preloadsDirectory.path])
    {
        NSArray *contents = [[NSFileManager defaultManager] contentsOfDirectoryAtURL:preloadsDirectory
                                                           includingPropertiesForKeys:nil options:0 error:nil];
        for (NSURL *fileURL in contents)
        {
            if ([[fileURL pathExtension] isEqualToString:@"js"])
            {
                NSData *data = [NSData dataWithContentsOfURL:fileURL];
                if (data) [JSI evaluate:data tag:[@"endcord:preload:" stringByAppendingString:fileURL.lastPathComponent] runtime:runtime];
            }
        }
    }
}

static void loadEndcord(jsi::Runtime &runtime)
{
    [loaderConfig loadConfig];
    forwardConsoleIfAsked(runtime);
    injectPreBundle(runtime);

    // Starts with the saved bundle and updates it for the next start. Without one (the first start, or Discord moved
    // to a newer Hermes) this start waits for the download, so Endcord is there from the first time Discord opens.
    NSData *bundle = usableSavedBundle();
    if (bundle)
    {
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{ fetchBundle(30.0); });
    }
    else
    {
        bundle = fetchBundle(15.0);
        if (!bundle && restoreBundleFromBackup()) bundle = usableSavedBundle();
    }

    if (!bundle)
    {
        showErrorAlert(@"Endcord couldn't load",
                       @"Endcord couldn't be downloaded. Check your connection and open Discord again.", nil);
        return;
    }

    NSString *error = [JSI evaluate:bundle tag:@"endcord:bundle" runtime:runtime];
    if (error)
    {
        showErrorAlert(@"Endcord couldn't start",
                       [NSString stringWithFormat:@"%@\n\nShake your device for the recovery menu.",
                                                  [error componentsSeparatedByString:@"\n"].firstObject],
                       nil);
        return;
    }
    executePreloads(runtime, getPyoncordDirectory());
}

%hook RCTHost

- (void)instance:(id)instance didInitializeRuntime:(facebook::jsi::Runtime &)runtime
{
    %orig;

    // Whatever goes wrong in Endcord, Discord itself starts
    @try
    {
        try
        {
            loadEndcord(runtime);
        }
        catch (const std::exception &e)
        {
            BunnyLog(@"Loading Endcord threw %s", e.what());
        }
    }
    @catch (NSException *exception)
    {
        BunnyLog(@"Loading Endcord threw %@: %@", exception.name, exception.reason);
    }
}

%end

%hook UIWindow

- (void)motionBegan:(UIEventSubtype)motion withEvent:(UIEvent *)event
{
    if (motion == UIEventSubtypeMotionShake)
    {
        isShaking      = YES;
        shakeStartTime = [[NSDate date] timeIntervalSince1970];
    }
    %orig;
}

- (void)motionEnded:(UIEventSubtype)motion withEvent:(UIEvent *)event
{
    if (motion == UIEventSubtypeMotionShake && isShaking)
    {
        NSTimeInterval shakeDuration = [[NSDate date] timeIntervalSince1970] - shakeStartTime;
        if (shakeDuration >= 0.5 && shakeDuration <= 2.0)
            dispatch_async(dispatch_get_main_queue(), ^{ showSettingsSheet(); });
        isShaking = NO;
    }
    %orig;
}

%end

%ctor
{
    @autoreleasepool
    {
        if (isAppExtension()) return;

        // Older Discord runs React Native with the bridge, which this tweak doesn't load into
        Class host = objc_getClass("RCTHost");
        if (!isRNNewArchEnabled() || !host || !class_getInstanceMethod(host, @selector(instance:didInitializeRuntime:)))
        {
            dispatch_async(dispatch_get_main_queue(), ^{
                showErrorAlert(@"Discord is too old for Endcord",
                              @"Endcord needs Discord 332 or newer.",
                              nil);
            });
            return;
        }

        isJailbroken = [[NSFileManager defaultManager] fileExistsAtPath:@"/var/jb"];

        loaderConfig = [[LoaderConfig alloc] init];
        [loaderConfig loadConfig];

        %init;
    }
}
