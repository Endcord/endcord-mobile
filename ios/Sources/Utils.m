#import "Utils.h"
#import "LoaderConfig.h"
#import "Logger.h"
#import <objc/message.h>
#import <spawn.h>
#import <sys/utsname.h>
#import <dlfcn.h>

BOOL isJailbroken = NO;

NSURL *getDocumentsDirectory(void) {
    return [[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask]
        .lastObject;
}

// Documents/pyoncord, where the bundle keeps the loader's files (lib/api/native/fs.ts)
NSURL *getPyoncordDirectory(void) {
    NSURL *pyoncordFolderURL = [getDocumentsDirectory() URLByAppendingPathComponent:@"pyoncord"];
    [[NSFileManager defaultManager] createDirectoryAtURL:pyoncordFolderURL
                             withIntermediateDirectories:YES
                                              attributes:nil
                                                   error:nil];
    return pyoncordFolderURL;
}

/** Documents/vd_mmkv, where the bundle keeps its storages (core/vendetta/storage.ts) */
static NSURL *getStorageDirectory(void) {
    return [getDocumentsDirectory() URLByAppendingPathComponent:@"vd_mmkv"];
}

// In Caches/pyoncord, where the bundle's clearBundle() removes it from
NSURL *getBundleURL(void) {
    NSFileManager *fileManager = [NSFileManager defaultManager];
    NSURL *cachesURL = [[fileManager URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask] lastObject];
    NSURL *folderURL = [cachesURL URLByAppendingPathComponent:@"pyoncord"];
    [fileManager createDirectoryAtURL:folderURL withIntermediateDirectories:YES attributes:nil error:nil];
    return [folderURL URLByAppendingPathComponent:@"bundle.js"];
}

// Where the saved bundle was downloaded from, and its ETag on a second line when the server sent one
NSURL *getBundleETagURL(void) {
    return [[getBundleURL() URLByDeletingLastPathComponent] URLByAppendingPathComponent:@"etag.txt"];
}

id readJSONFile(NSURL *url) {
    NSData *data = url ? [NSData dataWithContentsOfURL:url] : nil;
    return data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
}

/** Writes a JSON object to a file, creating its folder */
static BOOL writeJSONFile(id object, NSURL *url) {
    NSData *data = [NSJSONSerialization isValidJSONObject:object]
                       ? [NSJSONSerialization dataWithJSONObject:object options:0 error:nil]
                       : nil;
    if (!data) return NO;
    [[NSFileManager defaultManager] createDirectoryAtURL:[url URLByDeletingLastPathComponent]
                             withIntermediateDirectories:YES
                                              attributes:nil
                                                   error:nil];
    return [data writeToURL:url atomically:YES];
}

// "#RGB", "#RGBA", "#RRGGBB" or "#RRGGBBAA"; anything else, a theme's false for a color it leaves out among them, is nil
UIColor *hexToUIColor(id hex) {
    if (![hex isKindOfClass:[NSString class]] || ![hex hasPrefix:@"#"]) {
        return nil;
    }

    // Theme colors are looked up every time Discord draws one
    static NSCache<NSString *, UIColor *> *cache;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ cache = [NSCache new]; });
    UIColor *cached = [cache objectForKey:hex];
    if (cached) {
        return cached;
    }

    NSString *hexColor = [hex substringFromIndex:1];
    if (hexColor.length == 3 || hexColor.length == 4) {
        NSMutableString *expanded = [NSMutableString string];
        for (NSUInteger i = 0; i < hexColor.length; i++) {
            unichar c = [hexColor characterAtIndex:i];
            [expanded appendFormat:@"%C%C", c, c];
        }
        hexColor = expanded;
    }
    if (hexColor.length == 6) {
        hexColor = [hexColor stringByAppendingString:@"ff"];
    }

    NSCharacterSet *notHex =
        [[NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdefABCDEF"] invertedSet];
    if (hexColor.length != 8 || [hexColor rangeOfCharacterFromSet:notHex].location != NSNotFound) {
        return nil;
    }

    unsigned int hexNumber = 0;
    [[NSScanner scannerWithString:hexColor] scanHexInt:&hexNumber];
    CGFloat r = ((hexNumber & 0xFF000000) >> 24) / 255.0;
    CGFloat g = ((hexNumber & 0x00FF0000) >> 16) / 255.0;
    CGFloat b = ((hexNumber & 0x0000FF00) >> 8) / 255.0;
    CGFloat a = (hexNumber & 0x000000FF) / 255.0;

    UIColor *color = [UIColor colorWithRed:r green:g blue:b alpha:a];
    [cache setObject:color forKey:hex];
    return color;
}

/** The window the user sees: the key window of the active scene, or else any key or visible window */
static UIWindow *visibleWindow(void) {
    UIWindow *fallback = nil;
    for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
        if (![scene isKindOfClass:[UIWindowScene class]]) continue;
        BOOL active = scene.activationState == UISceneActivationStateForegroundActive;
        for (UIWindow *window in ((UIWindowScene *)scene).windows) {
            if (window.isKeyWindow && active) return window;
            if (!fallback && (window.isKeyWindow || !window.hidden) && window.rootViewController) fallback = window;
        }
    }
    // An app without scenes
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    for (UIWindow *window in [UIApplication sharedApplication].windows) {
        if (!fallback && (window.isKeyWindow || !window.hidden) && window.rootViewController) fallback = window;
    }
#pragma clang diagnostic pop
    return fallback;
}

// The view controller on top, which a new one has to be presented from: presenting from one that already presents fails
UIViewController *topViewController(void) {
    UIViewController *top = visibleWindow().rootViewController;
    while (top.presentedViewController && !top.presentedViewController.isBeingDismissed) {
        top = top.presentedViewController;
    }
    return top;
}

/** Presents an alert once there's a window to show it in: at launch Discord has none yet for a while */
static void presentWhenPossible(UIAlertController *alert, int attemptsLeft) {
    UIViewController *top = topViewController();
    if (top && top.view.window && !top.isBeingPresented && !top.isBeingDismissed) {
        [top presentViewController:alert animated:YES completion:nil];
        return;
    }
    if (attemptsLeft <= 0) {
        BunnyLog(@"No window to show \"%@\" in", alert.title);
        return;
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(),
                   ^{ presentWhenPossible(alert, attemptsLeft - 1); });
}

void showErrorAlert(NSString *title, NSString *message, void (^completion)(void)) {
    BunnyLog(@"%@: %@", title, message);
    dispatch_async(dispatch_get_main_queue(), ^{
        UIAlertController *alert =
            [UIAlertController alertControllerWithTitle:title
                                                message:message
                                         preferredStyle:UIAlertControllerStyleAlert];

        UIAlertAction *okAction = [UIAlertAction actionWithTitle:@"OK"
                                                           style:UIAlertActionStyleDefault
                                                         handler:^(UIAlertAction *action) {
                                                             if (completion) {
                                                                 completion();
                                                             }
                                                         }];

        [alert addAction:okAction];
        presentWhenPossible(alert, 60);
    });
}

NSString *getDeviceIdentifier(void) {
    struct utsname systemInfo;
    uname(&systemInfo);
    return [NSString stringWithCString:systemInfo.machine encoding:NSUTF8StringEncoding];
}

// iOS apps can't restart themselves: Discord is closed, to start with the change when it's opened again
void reloadApp(UIViewController *viewController) {
    void (^quit)(void) = ^{
        UIApplication *app = [UIApplication sharedApplication];
        ((void (*)(id, SEL))objc_msgSend)(app, @selector(suspend));
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{ exit(0); });
    };
    if (viewController) {
        [viewController dismissViewControllerAnimated:NO completion:quit];
    } else {
        quit();
    }
}

void deletePlugins(void) {
    NSFileManager *fm = [NSFileManager defaultManager];
    // Endcord's plugin settings and installed plugins, and the Vendetta plugins'
    [fm removeItemAtURL:[getPyoncordDirectory() URLByAppendingPathComponent:@"plugins"] error:nil];
    [fm removeItemAtURL:[getStorageDirectory() URLByAppendingPathComponent:@"VENDETTA_PLUGINS"] error:nil];
}

void deleteThemes(void) {
    NSFileManager *fm = [NSFileManager defaultManager];
    [fm removeItemAtURL:[getStorageDirectory() URLByAppendingPathComponent:@"VENDETTA_THEMES"] error:nil];
    [fm removeItemAtURL:[getPyoncordDirectory() URLByAppendingPathComponent:@"current-theme.json"] error:nil];
    [fm removeItemAtURL:[getPyoncordDirectory() URLByAppendingPathComponent:@"themes"] error:nil];
}

void deleteAllData(UIViewController *presenter) {
    [[NSFileManager defaultManager] removeItemAtURL:getPyoncordDirectory() error:nil];
    [[NSFileManager defaultManager] removeItemAtURL:getStorageDirectory() error:nil];
    gracefulExit(presenter);
}

void gracefulExit(UIViewController *presenter) {
    UIApplication *app = [UIApplication sharedApplication];
    [app performSelector:@selector(suspend)];

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(),
                   ^{ [app performSelector:@selector(terminateWithSuccess)]; });
}

void setCustomBundleURL(NSURL *url, UIViewController *presenter) {
    LoaderConfig *config        = [LoaderConfig getLoaderConfig];
    config.customLoadUrlEnabled = YES;
    config.customLoadUrl        = url;
    [config saveConfig];
    removeCachedBundle();
    gracefulExit(presenter);
}

void resetCustomBundleURL(UIViewController *presenter) {
    LoaderConfig *config        = [LoaderConfig getLoaderConfig];
    config.customLoadUrlEnabled = NO;
    [config saveConfig];
    removeCachedBundle();
    gracefulExit(presenter);
}

BOOL isSafeModeEnabled(void) {
    NSDictionary *settings = readJSONFile([getStorageDirectory() URLByAppendingPathComponent:@"VENDETTA_SETTINGS"]);
    if (![settings isKindOfClass:[NSDictionary class]]) return NO;
    NSDictionary *safeMode = settings[@"safeMode"];
    if (![safeMode isKindOfClass:[NSDictionary class]]) return NO;
    id enabled = safeMode[@"enabled"];
    return [enabled isKindOfClass:[NSNumber class]] && [enabled boolValue];
}

// As the bundle's own toggle (lib/api/debug): safe mode has no theme, and the one that was on comes back after it
void toggleSafeMode(void) {
    NSURL *settingsURL = [getStorageDirectory() URLByAppendingPathComponent:@"VENDETTA_SETTINGS"];
    NSURL *themeURL    = [getPyoncordDirectory() URLByAppendingPathComponent:@"current-theme.json"];

    id saved = readJSONFile(settingsURL);
    NSMutableDictionary *settings =
        [saved isKindOfClass:[NSDictionary class]] ? [saved mutableCopy] : [NSMutableDictionary dictionary];
    NSMutableDictionary *safeMode = [settings[@"safeMode"] isKindOfClass:[NSDictionary class]]
                                        ? [settings[@"safeMode"] mutableCopy]
                                        : [NSMutableDictionary dictionary];
    BOOL enable = !isSafeModeEnabled();

    if (enable) {
        NSDictionary *current = readJSONFile(themeURL);
        if ([current isKindOfClass:[NSDictionary class]] && [current[@"id"] isKindOfClass:[NSString class]]) {
            safeMode[@"currentThemeId"] = current[@"id"];
        }
        writeJSONFile(@{}, themeURL);
    } else {
        NSDictionary *themes = readJSONFile([getStorageDirectory() URLByAppendingPathComponent:@"VENDETTA_THEMES"]);
        id themeId           = safeMode[@"currentThemeId"];
        NSDictionary *theme  = [themes isKindOfClass:[NSDictionary class]] && [themeId isKindOfClass:[NSString class]]
                                   ? themes[themeId]
                                   : nil;
        if ([theme isKindOfClass:[NSDictionary class]]) {
            NSMutableDictionary *selected = [theme mutableCopy];
            selected[@"selected"]         = @YES;
            writeJSONFile(selected, themeURL);
        }
    }

    safeMode[@"enabled"]  = @(enable);
    settings[@"safeMode"] = safeMode;
    writeJSONFile(settings, settingsURL);

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.4 * NSEC_PER_SEC)), dispatch_get_main_queue(),
                   ^{ reloadApp(topViewController()); });
}

NSURL *getBundleBackupURL(void) {
    return [getBundleURL() URLByAppendingPathExtension:@"backup"];
}

void moveCachedBundleToBackup(void) {
    NSFileManager *fm = [NSFileManager defaultManager];
    NSURL *bundleURL = getBundleURL();
    NSURL *backupURL = getBundleBackupURL();

    if ([fm fileExistsAtPath:backupURL.path]) {
        NSError *removeError = nil;
        [fm removeItemAtURL:backupURL error:&removeError];
        if (removeError) {
            BunnyLog(@"Failed to remove old backup: %@", removeError);
        }
    }

    if ([fm fileExistsAtPath:bundleURL.path]) {
        NSError *moveError = nil;
        [fm moveItemAtURL:bundleURL toURL:backupURL error:&moveError];
        if (moveError) {
            BunnyLog(@"Failed to create bundle backup: %@", moveError);
        } else {
            BunnyLog(@"Successfully moved bundle to backup");
        }
    } else {
        BunnyLog(@"No cached bundle to backup");
    }
}

BOOL restoreBundleFromBackup(void) {
    NSFileManager *fm = [NSFileManager defaultManager];
    NSURL *bundleURL = getBundleURL();
    NSURL *backupURL = getBundleBackupURL();

    if ([fm fileExistsAtPath:backupURL.path]) {
        if ([fm fileExistsAtPath:bundleURL.path]) {
            [fm removeItemAtURL:bundleURL error:nil];
        }

        NSError *error = nil;
        [fm moveItemAtURL:backupURL toURL:bundleURL error:&error];
        if (error) {
            BunnyLog(@"Failed to restore bundle from backup: %@", error);
            return NO;
        }
        BunnyLog(@"Successfully restored bundle from backup");
        return YES;
    }

    BunnyLog(@"No backup bundle found to restore");
    return NO;
}

void cleanupBundleBackup(void) {
    NSFileManager *fm = [NSFileManager defaultManager];
    NSURL *backupURL = getBundleBackupURL();

    if ([fm fileExistsAtPath:backupURL.path]) {
        NSError *error = nil;
        [fm removeItemAtURL:backupURL error:&error];
        if (error) {
            BunnyLog(@"Failed to cleanup backup: %@", error);
        } else {
            BunnyLog(@"Cleaned up bundle backup");
        }
    }
}


void deletePluginsAndReload(UIViewController *presenter) {
    deletePlugins();
    reloadApp(presenter);
}

void deleteThemesAndReload(UIViewController *presenter) {
    deleteThemes();
    reloadApp(presenter);
}

void refetchBundle(UIViewController *presenter) {
    moveCachedBundleToBackup();
    reloadApp(presenter);
}

void removeCachedBundle(void) {
    NSError *error = nil;
    [[NSFileManager defaultManager] removeItemAtURL:getBundleURL() error:&error];
    [[NSFileManager defaultManager] removeItemAtURL:getBundleETagURL() error:nil];
    if (error) {
        BunnyLog(@"Failed to remove cached bundle: %@", error);
    }
}

BOOL isRNNewArchEnabled(void) {
    id raw = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"RCTNewArchEnabled"];
    if ([raw respondsToSelector:@selector(boolValue)]) {
        return [raw boolValue];
    }
    // Discord leaves it out since the new architecture is the only one
    return YES;
}

// The tweak is loaded into Discord's screen share extension too, for its app group (Sideloading.x)
BOOL isAppExtension(void) {
    return [NSBundle.mainBundle.bundlePath.pathExtension isEqualToString:@"appex"];
}

BOOL isHermesBytecode(NSData *data) {
    if (!data || data.length < 4) {
        return NO;
    }
    const uint8_t *bytes = (const uint8_t *)data.bytes;
    if (bytes[0] == 0xC6 && bytes[1] == 0x1F && bytes[2] == 0xBC && bytes[3] == 0x03) {
        return YES;
    }

    if (bytes[0] > 0x7F) {
        for (int i = 0; i < 4 && i < (int)data.length; i++) {
            if (bytes[i] == 0x00) return YES;
        }
    }
    return NO;
}

uint32_t hermesBytecodeVersion(NSData *data) {
    // An 8-byte magic number and then the version, both little-endian, as in bundle/scripts/hermes.mjs
    static const uint8_t magic[] = {0xC6, 0x1F, 0xBC, 0x03, 0xC1, 0x03, 0x19, 0x1F};
    if (data.length < 12 || memcmp(data.bytes, magic, sizeof(magic)) != 0) {
        return 0;
    }
    uint32_t version;
    memcpy(&version, (const uint8_t *)data.bytes + 8, sizeof(version));
    return CFSwapInt32LittleToHost(version);
}

// The bundle's rule for font names (lib/addons/fonts): they make the paths fonts are saved at, so "../.." would write
// outside the fonts folder
BOOL isSafeFileName(id name) {
    if (![name isKindOfClass:[NSString class]]) return NO;
    NSString *string = name;
    if (string.length == 0 || string.length > 100 || [string hasPrefix:@"."]) return NO;
    NSMutableCharacterSet *forbidden = [NSMutableCharacterSet characterSetWithRange:NSMakeRange(0, 0x20)];
    [forbidden addCharactersInString:@"/\\"];
    return [string rangeOfCharacterFromSet:forbidden].location == NSNotFound;
}

// The extension the bundle saves a font file with: the link's, when it's ttf or otf
NSString *fontFileExtension(NSString *url) {
    NSString *extension = [url componentsSeparatedByString:@"."].lastObject;
    return [extension isEqualToString:@"otf"] ? @"otf" : @"ttf";
}
