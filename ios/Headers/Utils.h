#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

@class BunnySettingsViewController;

extern BOOL isJailbroken;

#ifdef __cplusplus
extern "C" {
#endif

BOOL        isSafeModeEnabled(void);
BOOL        restoreBundleFromBackup(void);
NSURL      *getDocumentsDirectory(void);
NSURL      *getPyoncordDirectory(void);
NSURL      *getBundleURL(void);
NSURL      *getBundleETagURL(void);
NSURL      *getBundleBackupURL(void);
UIColor    *hexToUIColor(id hex);
NSString   *getDeviceIdentifier(void);
UIViewController *topViewController(void);
void        showErrorAlert(NSString *title, NSString *message, void (^completion)(void));
void        reloadApp(UIViewController *viewController);
void        deletePlugins(void);
void        deleteThemes(void);
void        deleteAllData(UIViewController *presenter);
void        refetchBundle(UIViewController *presenter);
void        toggleSafeMode(void);
void        setCustomBundleURL(NSURL *url, UIViewController *presenter);
void        resetCustomBundleURL(UIViewController *presenter);
void        removeCachedBundle(void);
void        gracefulExit(UIViewController *presenter);
void        deletePluginsAndReload(UIViewController *presenter);
void        deleteThemesAndReload(UIViewController *presenter);
void        moveCachedBundleToBackup(void);
void        cleanupBundleBackup(void);
BOOL        isRNNewArchEnabled(void);
BOOL        isAppExtension(void);
BOOL        isHermesBytecode(NSData *data);
uint32_t    hermesBytecodeVersion(NSData *data);
BOOL        isSafeFileName(id name);
NSString   *fontFileExtension(NSString *url);
id          readJSONFile(NSURL *url);

#ifdef __cplusplus
}
#endif
