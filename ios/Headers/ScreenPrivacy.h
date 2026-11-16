#import <Foundation/Foundation.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * The `endcord.screenPrivacy.set` bridge method, for the PrivacyCurtain plugin: [mode], "off", "recents" or "all".
 * Returns the mode it took; anything that isn't one is off, as on the Android loader.
 */
NSString *setScreenPrivacy(NSArray *args);

#ifdef __cplusplus
}
#endif
