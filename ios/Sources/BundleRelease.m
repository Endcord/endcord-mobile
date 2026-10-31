#import <CommonCrypto/CommonDigest.h>
#import <Security/Security.h>

#import "BundleRelease.h"
#import "Logger.h"

// An uncompressed P-256 point, the end of the SubjectPublicKeyInfo in release-key.pub, is what SecKey takes
static const NSUInteger kPublicKeyLength = 65;

static SecKeyRef copyReleaseKey(void)
{
    NSData *encoded = [[NSData alloc] initWithBase64EncodedString:ENDCORD_RELEASE_KEY options:0];
    if (encoded.length < kPublicKeyLength) return NULL;
    NSData *point = [encoded subdataWithRange:NSMakeRange(encoded.length - kPublicKeyLength, kPublicKeyLength)];
    NSDictionary *attributes = @{
        (__bridge NSString *) kSecAttrKeyType : (__bridge NSString *) kSecAttrKeyTypeECSECPrimeRandom,
        (__bridge NSString *) kSecAttrKeyClass : (__bridge NSString *) kSecAttrKeyClassPublic,
        (__bridge NSString *) kSecAttrKeySizeInBits : @256,
    };
    return SecKeyCreateWithData((__bridge CFDataRef) point, (__bridge CFDictionaryRef) attributes, NULL);
}

static NSString *sha256Hex(NSData *data)
{
    unsigned char digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG) data.length, digest);
    NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
    for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) [hex appendFormat:@"%02x", digest[i]];
    return hex;
}

@implementation BundleRelease
{
    NSSet<NSString *> *_bundles;
}

+ (instancetype)releaseWithManifest:(NSData *)manifest signature:(NSData *)signature
{
    SecKeyRef key = copyReleaseKey();
    if (!key)
    {
        BunnyLog(@"The release key this tweak was built with can't be read");
        return nil;
    }
    BOOL valid = SecKeyVerifySignature(key, kSecKeyAlgorithmECDSASignatureMessageX962SHA256,
                                       (__bridge CFDataRef) manifest, (__bridge CFDataRef) signature, NULL);
    CFRelease(key);
    if (!valid) return nil;

    NSDictionary *json = [NSJSONSerialization JSONObjectWithData:manifest options:0 error:nil];
    if (![json isKindOfClass:NSDictionary.class] || ![json[@"format"] isEqual:@1]) return nil;
    if (![json[@"sequence"] isKindOfClass:NSNumber.class] || ![json[@"files"] isKindOfClass:NSDictionary.class]) return nil;

    NSMutableSet<NSString *> *bundles = [NSMutableSet set];
    for (NSDictionary *file in [json[@"files"] allValues])
    {
        if (![file isKindOfClass:NSDictionary.class]) return nil;
        if (![file[@"sha256"] isKindOfClass:NSString.class] || ![file[@"size"] isKindOfClass:NSNumber.class]) return nil;
        [bundles addObject:[NSString stringWithFormat:@"%@:%@", file[@"size"], [file[@"sha256"] lowercaseString]]];
    }

    BundleRelease *release = [BundleRelease new];
    release->_sequence = [json[@"sequence"] unsignedLongLongValue];
    release->_bundles  = bundles;
    return release;
}

- (BOOL)contains:(NSData *)bundle
{
    return [_bundles containsObject:[NSString stringWithFormat:@"%lu:%@", (unsigned long) bundle.length, sha256Hex(bundle)]];
}

@end
