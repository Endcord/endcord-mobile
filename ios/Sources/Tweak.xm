#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <jsi/jsi.h>
#import <functional>
#import <unistd.h>

#import "LoaderConfig.h"
#import "Logger.h"
#import "Utils.h"
#import "JSI.h"
#import "RCTHost.h"
#import "RCTInstance.h"
#import "Fonts.h"
#import "Settings.h"
#import "Themes.h"

using namespace facebook;

#define LOADER_NAME @"EndcordTweak"
// The published bundle; endcord.v<version>.hbc next to it is the same bundle precompiled for that Hermes bytecode version
#ifdef ENDCORD_BUNDLE_URL
#define BUNDLE_URL ENDCORD_BUNDLE_URL
#else
#define BUNDLE_URL  @"https://raw.githubusercontent.com/Endcord/endcord-mobile/builds-next/endcord.min.js"
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

/**
 * The saved bundle, if it can run in this Discord: plain JS always can, bytecode only on the version it was compiled
 * for. After Discord moves to a newer Hermes, the bytecode saved for the old one is as good as missing.
 */
static NSData *usableSavedBundle(void)
{
    __block NSData *bundle;
    dispatch_sync(fsQueue(), ^{ bundle = [NSData dataWithContentsOfURL:getBundleURL()]; });
    if (bundle.length == 0) return nil;

    uint32_t version = hermesBytecodeVersion(bundle);
    if (version && version != discordBytecodeVersion())
    {
        BunnyLog(@"The saved bundle is bytecode version %u, Discord's is %u", version, discordBytecodeVersion());
        return nil;
    }
    return bundle;
}

/** The URL the saved bundle came from and its ETag, saved as two lines */
static NSArray<NSString *> *savedETag(void)
{
    __block NSString *saved;
    dispatch_sync(fsQueue(), ^{
        saved = [NSString stringWithContentsOfURL:getBundleETagURL() encoding:NSUTF8StringEncoding error:nil];
    });
    NSArray<NSString *> *lines = [saved componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet];
    return lines.count >= 2 && lines[0].length && lines[1].length ? @[ lines[0], lines[1] ] : nil;
}

/**
 * Downloads the bundle and saves it, trying each of bundleURLs() until one has it. Returns the bundle to run: the
 * new one, the saved one when the server says it's unchanged, or nil when none could be fetched.
 */
static NSData *fetchBundle(NSTimeInterval timeout)
{
    NSData *saved = usableSavedBundle();
    NSArray<NSString *> *etag = saved ? savedETag() : nil;
    NSURLSession *session = [NSURLSession sessionWithConfiguration:NSURLSessionConfiguration.ephemeralSessionConfiguration];
    NSData *result = nil;

    for (NSURL *url in bundleURLs())
    {
        NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url
                                                               cachePolicy:NSURLRequestReloadIgnoringLocalAndRemoteCacheData
                                                           timeoutInterval:timeout];
        if (etag && [etag[0] isEqualToString:url.absoluteString])
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

        if (response.statusCode == 304)
        {
            BunnyLog(@"The bundle at %@ hasn't changed", url);
            result = saved;
            break;
        }
        if (response.statusCode == 200 && data.length > 0)
        {
            BunnyLog(@"Downloaded the bundle from %@ (%lu bytes)", url, (unsigned long)data.length);
            NSString *newETag = [response valueForHTTPHeaderField:@"ETag"];
            dispatch_sync(fsQueue(), ^{
                [data writeToURL:getBundleURL() atomically:YES];
                if (newETag)
                {
                    NSString *lines = [NSString stringWithFormat:@"%@\n%@", url.absoluteString, newETag];
                    [lines writeToURL:getBundleETagURL() atomically:YES encoding:NSUTF8StringEncoding error:nil];
                }
                else
                {
                    [[NSFileManager defaultManager] removeItemAtURL:getBundleETagURL() error:nil];
                }
            });
            cleanupBundleBackup();
            result = data;
            break;
        }
        // A missing precompiled bundle falls back to the plain one; so does any other failure, which it may not have
        BunnyLog(@"Couldn't download the bundle from %@: %@", url,
                 error ? error.localizedDescription : [NSString stringWithFormat:@"HTTP %ld", (long)response.statusCode]);
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

/** The theme the bundle saved for the next start, applied to Discord's native colors before any view is drawn */
static jsi::Value loadStoredTheme(jsi::Runtime &runtime)
{
    NSData *themeData = [NSData dataWithContentsOfURL:[getPyoncordDirectory() URLByAppendingPathComponent:@"current-theme.json"]];
    if (!themeData) return jsi::Value::null();

    NSDictionary *theme = [NSJSONSerialization JSONObjectWithData:themeData options:0 error:nil];
    if (![theme isKindOfClass:NSDictionary.class]) return jsi::Value::null();

    NSDictionary *data = theme[@"data"];
    if ([data isKindOfClass:NSDictionary.class] && [data[@"semanticColors"] isKindOfClass:NSDictionary.class])
    {
        NSDictionary *rawColors = [data[@"rawColors"] isKindOfClass:NSDictionary.class] ? data[@"rawColors"] : @{};
        initializeThemeColors(data[@"semanticColors"], rawColors);
    }
    return [JSI fromObjC:theme runtime:runtime];
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
                if (data) [JSI evaluate:data tag:@"endcord:preload" runtime:runtime];
            }
        }
    }
}

%hook RCTHost

- (void)instance:(id)instance didInitializeRuntime:(facebook::jsi::Runtime &)runtime
{
    %orig;

    [loaderConfig loadConfig];
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

    if (bundle)
    {
        [JSI evaluate:bundle tag:@"endcord:bundle" runtime:runtime];
        executePreloads(runtime, getPyoncordDirectory());
    }
    else
    {
        showErrorAlert(@"Endcord couldn't load",
                       @"Endcord couldn't be downloaded. Check your connection and open Discord again.", nil);
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
        if (!isRNNewArchEnabled())
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
