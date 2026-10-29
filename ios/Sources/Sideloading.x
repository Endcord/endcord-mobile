#import <AuthenticationServices/AuthenticationServices.h>
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <dlfcn.h>

#import "Logger.h"
#import "Utils.h"

typedef struct __CMSDecoder *CMSDecoderRef;
extern CFTypeRef             SecCMSDecodeGetContent(CFDataRef message);
extern OSStatus              CMSDecoderCreate(CMSDecoderRef *cmsDecoder);
extern OSStatus              CMSDecoderUpdateMessage(CMSDecoderRef cmsDecoder, const void *content,
                                                     size_t contentLength);
extern OSStatus              CMSDecoderFinalizeMessage(CMSDecoderRef cmsDecoder);
extern OSStatus              CMSDecoderCopyContent(CMSDecoderRef cmsDecoder, CFDataRef *content);

#define DISCORD_BUNDLE_ID @"com.hammerandchisel.discord"
#define DISCORD_NAME      @"Discord"

typedef NS_ENUM(NSInteger, BundleIDError) {
    BundleIDErrorIcon,
    BundleIDErrorPasskey
};

static void showBundleIDError(BundleIDError error)
{
    NSString *message;
    NSString *title;

    switch (error)
    {
        case BundleIDErrorIcon:
            message = @"For this to work change the Bundle ID so that it matches your "
                      @"provisioning profile's App ID (excluding the Team ID prefix).";
            title   = @"Cannot Change Icon";
            break;
        case BundleIDErrorPasskey:
            message    = @"Passkeys are not supported when sideloading Discord. "
                         @"Please use a different login method.";
            title      = @"Cannot Use Passkey";
            break;
    }

    showErrorAlert(title, message, nil);
}

static NSString *queryAccessGroupID(void);

// Asked for on every use of the pasteboard; it can't change while Discord runs
static NSString *getAccessGroupID(void)
{
    static NSString *cached;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ cached = queryAccessGroupID(); });
    return cached;
}

static NSString *queryAccessGroupID(void)
{
    NSDictionary *query = @{
        (__bridge NSString *) kSecClass : (__bridge NSString *) kSecClassGenericPassword,
        (__bridge NSString *) kSecAttrAccount : @"bundleSeedID",
        (__bridge NSString *) kSecAttrService : @"",
        (__bridge NSString *) kSecReturnAttributes : @YES
    };

    CFDictionaryRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef) query, (CFTypeRef *) &result);

    if (status == errSecItemNotFound)
    {
        status = SecItemAdd((__bridge CFDictionaryRef) query, (CFTypeRef *) &result);
    }

    if (status != errSecSuccess)
        return nil;

    NSString *accessGroup =
        [(__bridge NSDictionary *) result objectForKey:(__bridge NSString *) kSecAttrAccessGroup];
    if (result)
        CFRelease(result);

    return accessGroup;
}

/**
 * Whether code in Discord's app (not the system's) made the call the hook is in, from the hook's return address. The
 * App ID a sideloaded Discord is signed with is told to Discord's code only.
 */
static BOOL isSelfCall(void *returnAddress)
{
    Dl_info info = {0};
    if (!returnAddress || dladdr(returnAddress, &info) == 0 || !info.dli_fname)
        return NO;

    static const char *appPath;
    static size_t appPathLength;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        appPath       = strdup(NSBundle.mainBundle.bundlePath.fileSystemRepresentation);
        appPathLength = strlen(appPath);
    });
    return strncmp(info.dli_fname, appPath, appPathLength) == 0;
}

#define CALLED_FROM_DISCORD isSelfCall(__builtin_return_address(0))

%group Sideloading

%hook NSBundle
- (NSString *)bundleIdentifier
{
    return CALLED_FROM_DISCORD ? DISCORD_BUNDLE_ID : %orig;
}

- (NSDictionary *)infoDictionary
{
    if (!CALLED_FROM_DISCORD)
        return %orig;

    NSDictionary *origResult = %orig;
    NSMutableDictionary *info = [origResult mutableCopy];

    info[@"CFBundleIdentifier"]  = DISCORD_BUNDLE_ID;
    info[@"CFBundleDisplayName"] = DISCORD_NAME;
    info[@"CFBundleName"]        = DISCORD_NAME;
    return info;
}

- (id)objectForInfoDictionaryKey:(NSString *)key
{
    if (!CALLED_FROM_DISCORD)
        return %orig;

    if ([key isEqualToString:@"CFBundleIdentifier"])
        return DISCORD_BUNDLE_ID;
    if ([key isEqualToString:@"CFBundleDisplayName"] || [key isEqualToString:@"CFBundleName"])
        return DISCORD_NAME;
    return %orig;
}
%end

%hook NSFileManager
- (NSURL *)containerURLForSecurityApplicationGroupIdentifier:(NSString *)groupIdentifier
{
    BunnyLog(@"containerURLForSecurityApplicationGroupIdentifier called! %@",
             groupIdentifier ?: @"nil");

    // A sideloaded app has no app group: a folder of its own stands in for it, which has to exist to be written to
    NSArray *paths    = [self URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask];
    NSURL   *appGroup = [[paths lastObject] URLByAppendingPathComponent:@"AppGroup"];
    [self createDirectoryAtURL:appGroup withIntermediateDirectories:YES attributes:nil error:nil];
    return appGroup;
}
%end

%hook UIPasteboard
- (NSString *)_accessGroup
{
    return getAccessGroupID();
}
%end

%hook UIApplication
- (void)setAlternateIconName:(NSString *)iconName completionHandler:(void (^)(NSError *))completion
{
    void (^wrappedCompletion)(NSError *) = ^(NSError *error) {
        if (error)
        {
            showBundleIDError(BundleIDErrorIcon);
        }

        if (completion)
        {
            completion(error);
        }
    };

    %orig(iconName, wrappedCompletion);
}
%end

// https://github.com/khanhduytran0/LiveContainer/blob/main/TweakLoader/DocumentPicker.m
%hook UIDocumentPickerViewController

- (instancetype)initForOpeningContentTypes:(NSArray<UTType *> *)contentTypes asCopy:(BOOL)asCopy
{
    BOOL shouldMultiselect = NO;
    if ([contentTypes count] == 1 && contentTypes[0] == UTTypeFolder)
    {
        shouldMultiselect = YES;
    }

    NSArray<UTType *> *contentTypesNew = @[ UTTypeItem, UTTypeFolder ];

    UIDocumentPickerViewController *ans = %orig(contentTypesNew, YES);
    if (shouldMultiselect)
    {
        [ans setAllowsMultipleSelection:YES];
    }
    return ans;
}

- (instancetype)initWithDocumentTypes:(NSArray<UTType *> *)contentTypes inMode:(NSUInteger)mode
{
    return [self initForOpeningContentTypes:contentTypes asCopy:(mode == 1 ? NO : YES)];
}

- (void)setAllowsMultipleSelection:(BOOL)allowsMultipleSelection
{
    if ([self allowsMultipleSelection])
    {
        return;
    }
    %orig(YES);
}

%end

%hook UIDocumentBrowserViewController

- (instancetype)initForOpeningContentTypes:(NSArray<UTType *> *)contentTypes
{
    NSArray<UTType *> *contentTypesNew = @[ UTTypeItem, UTTypeFolder ];
    return %orig(contentTypesNew);
}

%end

%hook NSURL

- (BOOL)startAccessingSecurityScopedResource
{
    %orig;
    return YES;
}

%end

// Passkeys need the app's associated domains, which a sideloaded app isn't signed with. Discord is told the request
// was canceled, so its login screen carries on, instead of waiting for an answer that never comes.
%hook ASAuthorizationController

- (void)performRequests
{
    showBundleIDError(BundleIDErrorPasskey);

    id<ASAuthorizationControllerDelegate> delegate = self.delegate;
    if ([delegate respondsToSelector:@selector(authorizationController:didCompleteWithError:)])
    {
        NSError *canceled = [NSError errorWithDomain:ASAuthorizationErrorDomain
                                                code:ASAuthorizationErrorCanceled
                                            userInfo:nil];
        dispatch_async(dispatch_get_main_queue(), ^{
            [delegate authorizationController:self didCompleteWithError:canceled];
        });
    }
}

%end

%end

%ctor
{
    BOOL isAppStoreApp = [[NSFileManager defaultManager]
        fileExistsAtPath:[[NSBundle mainBundle] appStoreReceiptURL].path];
    if (!isAppStoreApp)
    {
        %init(Sideloading);
    }
}
