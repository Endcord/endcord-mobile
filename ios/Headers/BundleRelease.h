#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * A published bundle's endcord-release.json, once its signature is checked against the public key the tweak is built
 * with (bundle/scripts/sign-release.mjs writes both). The server only stores it: it can't change what a release says.
 */
@interface BundleRelease : NSObject

@property (nonatomic, readonly) unsigned long long sequence;

/** Nil unless the signature is valid and the manifest is one this tweak can read */
+ (nullable instancetype)releaseWithManifest:(NSData *)manifest signature:(NSData *)signature;

/** Whether a bundle is one this release lists, by size and SHA-256 */
- (BOOL)contains:(NSData *)bundle;

/** The address of a bundle of this release that never changes, unlike the branch's, which the CDN caches */
- (nullable NSURL *)pinnedURLOf:(NSString *)name;

@end

NS_ASSUME_NONNULL_END
