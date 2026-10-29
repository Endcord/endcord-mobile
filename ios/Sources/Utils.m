#import "Utils.h"
#import "LoaderConfig.h"
#import "Logger.h"
#import <objc/message.h>
#import <spawn.h>
#import <sys/utsname.h>
#import <dlfcn.h>

BOOL isJailbroken = NO;

NSURL *getPyoncordDirectory(void) {
    BunnyLog(@"getPyoncordDirectory: start");
    NSFileManager *fileManager  = [NSFileManager defaultManager];
    BunnyLog(@"getPyoncordDirectory: got fileManager");
    NSURL *documentDirectoryURL = [[fileManager URLsForDirectory:NSDocumentDirectory
                                                   inDomains:NSUserDomainMask] lastObject];
    BunnyLog(@"getPyoncordDirectory: documentDirectoryURL = %@", documentDirectoryURL);

    NSURL *pyoncordFolderURL = [documentDirectoryURL URLByAppendingPathComponent:@"pyoncord"];
    BunnyLog(@"getPyoncordDirectory: pyoncordFolderURL = %@", pyoncordFolderURL);

    if (![fileManager fileExistsAtPath:pyoncordFolderURL.path]) {
        BunnyLog(@"getPyoncordDirectory: creating directory...");
        [fileManager createDirectoryAtURL:pyoncordFolderURL
                  withIntermediateDirectories:YES
                                   attributes:nil
                                       error:nil];
        BunnyLog(@"getPyoncordDirectory: directory created");
    }

    BunnyLog(@"getPyoncordDirectory: returning %@", pyoncordFolderURL);
    return pyoncordFolderURL;
}

// In Caches/pyoncord, where the bundle's clearBundle() removes it from
NSURL *getBundleURL(void) {
    NSFileManager *fileManager = [NSFileManager defaultManager];
    NSURL *cachesURL = [[fileManager URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask] lastObject];
    NSURL *folderURL = [cachesURL URLByAppendingPathComponent:@"pyoncord"];
    [fileManager createDirectoryAtURL:folderURL withIntermediateDirectories:YES attributes:nil error:nil];
    return [folderURL URLByAppendingPathComponent:@"bundle.js"];
}

NSURL *getBundleETagURL(void) {
    return [[getBundleURL() URLByDeletingLastPathComponent] URLByAppendingPathComponent:@"etag.txt"];
}

UIColor *hexToUIColor(NSString *hex) {
    if (![hex hasPrefix:@"#"]) {
        return nil;
    }

    NSString *hexColor = [hex substringFromIndex:1];
    if (hexColor.length == 6) {
        hexColor = [hexColor stringByAppendingString:@"ff"];
    }

    if (hexColor.length == 8) {
        unsigned int hexNumber;
        NSScanner *scanner = [NSScanner scannerWithString:hexColor];
        if ([scanner scanHexInt:&hexNumber]) {
            CGFloat r = ((hexNumber & 0xFF000000) >> 24) / 255.0;
            CGFloat g = ((hexNumber & 0x00FF0000) >> 16) / 255.0;
            CGFloat b = ((hexNumber & 0x0000FF00) >> 8) / 255.0;
            CGFloat a = (hexNumber & 0x000000FF) / 255.0;

            return [UIColor colorWithRed:r green:g blue:b alpha:a];
        }
    }

    return nil;
}

void showErrorAlert(NSString *title, NSString *message, void (^completion)(void)) {
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

        UIWindow *window = nil;
        NSArray *windows = [[UIApplication sharedApplication] windows];
        for (UIWindow *w in windows) {
            if (w.isKeyWindow) {
                window = w;
                break;
            }
        }

        [window.rootViewController presentViewController:alert animated:YES completion:nil];
    });
}

NSString *getDeviceIdentifier(void) {
    struct utsname systemInfo;
    uname(&systemInfo);
    return [NSString stringWithCString:systemInfo.machine encoding:NSUTF8StringEncoding];
}

void reloadApp(UIViewController *viewController) {
    [viewController
        dismissViewControllerAnimated:NO
                           completion:^{
                               UIApplication *app = [UIApplication sharedApplication];
                               ((void (*)(id, SEL))objc_msgSend)(app, @selector(suspend));
                               dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 0.5 * NSEC_PER_SEC),
                                              dispatch_get_main_queue(), ^{ exit(0); });
                           }];
}

void loadCustomBundleFromURL(NSURL *url, UIViewController *viewController) {
    LoaderConfig *config        = [LoaderConfig getLoaderConfig];
    config.customLoadUrlEnabled = YES;
    config.customLoadUrl        = url;
    if ([config saveConfig]) {
        reloadApp(viewController);
    } else {
        showErrorAlert(@"Error", @"Failed to save custom bundle configuration", nil);
    }
}

void deletePlugins(void) {
    [[NSFileManager defaultManager]
        removeItemAtURL:[getPyoncordDirectory() URLByAppendingPathComponent:@"plugins"]
                  error:nil];
}

void deleteThemes(void) {
    [[NSFileManager defaultManager]
        removeItemAtURL:[getPyoncordDirectory() URLByAppendingPathComponent:@"themes"]
                  error:nil];
}

void deleteAllData(UIViewController *presenter) {
    [[NSFileManager defaultManager] removeItemAtURL:getPyoncordDirectory() error:nil];
    gracefulExit(presenter);
}

void gracefulExit(UIViewController *presenter) {
    UIApplication *app = [UIApplication sharedApplication];
    [app performSelector:@selector(suspend)];

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 0.5 * NSEC_PER_SEC), dispatch_get_main_queue(),
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
    config.customLoadUrl        = [NSURL URLWithString:@"http://localhost:4040/endcord.min.js"];
    [config saveConfig];
    removeCachedBundle();
    gracefulExit(presenter);
}

BOOL isSafeModeEnabled(void) {
    NSURL *documentDirectoryURL =
        [[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory
                                               inDomains:NSUserDomainMask]
            .lastObject;
    NSURL *settingsURL =
        [documentDirectoryURL URLByAppendingPathComponent:@"vd_mmkv/VENDETTA_SETTINGS"];

    NSData *data = [NSData dataWithContentsOfURL:settingsURL];
    if (!data)
        return NO;

    NSError *error         = nil;
    NSDictionary *settings = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
    if (error)
        return NO;

    return [settings[@"safeMode"][@"enabled"] boolValue];
}

void toggleSafeMode(void) {
    NSURL *documentDirectoryURL =
        [[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory
                                               inDomains:NSUserDomainMask]
            .lastObject;
    NSURL *settingsURL =
        [documentDirectoryURL URLByAppendingPathComponent:@"vd_mmkv/VENDETTA_SETTINGS"];
    NSURL *themeURL = [documentDirectoryURL URLByAppendingPathComponent:@"vd_mmkv/VENDETTA_THEMES"];

    NSData *data                  = [NSData dataWithContentsOfURL:settingsURL];
    NSMutableDictionary *settings = nil;

    if (data) {
        settings = [[NSJSONSerialization JSONObjectWithData:data
                                                    options:NSJSONReadingMutableContainers
                                                      error:nil] mutableCopy];
    } else {
        settings = [NSMutableDictionary dictionary];
    }

    if (!settings[@"safeMode"]) {
        settings[@"safeMode"] = [NSMutableDictionary dictionary];
    }

    BOOL currentState                 = [settings[@"safeMode"][@"enabled"] boolValue];
    BOOL newState                     = !currentState;
    settings[@"safeMode"][@"enabled"] = @(newState);

    NSData *themeData = [NSData dataWithContentsOfURL:themeURL];
    if (themeData) {
        NSDictionary *theme = [NSJSONSerialization JSONObjectWithData:themeData
                                                              options:0
                                                                error:nil];
        if (theme && theme[@"id"]) {
            if (newState) {
                settings[@"safeMode"][@"currentThemeId"] = theme[@"id"];
                [[NSFileManager defaultManager] removeItemAtURL:themeURL error:nil];
            }
        }
    }

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:settings options:0 error:nil];
    [jsonData writeToURL:settingsURL atomically:YES];

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 0.4 * NSEC_PER_SEC), dispatch_get_main_queue(),
                   ^{
                       UIViewController *rootVC =
                           [UIApplication sharedApplication].windows.firstObject.rootViewController;
                       reloadApp(rootVC);
                   });
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
    BunnyLog(@"isRNNewArchEnabled: start");
    id raw = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"RCTNewArchEnabled"];
    BunnyLog(@"isRNNewArchEnabled: raw = %@", raw);
    if (raw) {
        return [raw boolValue];
    }
    BunnyLog(@"isRNNewArchEnabled: assuming YES (bridgeless)");
    return YES;
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
