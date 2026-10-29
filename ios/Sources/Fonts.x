#import <CoreFoundation/CoreFoundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreText/CoreText.h>

#import "Fonts.h"
#import "Logger.h"
#import "Utils.h"

// Discord's font names to the ones that replace them; filled before the hooks are installed and only read after
NSMutableDictionary<NSString *, NSString *> *fontMap;

%hook UIFont

+ (UIFont *)fontWithName:(NSString *)name size:(CGFloat)size
{
    NSString *replacementName = name ? fontMap[name] : nil;
    if (replacementName)
    {
        UIFontDescriptor *replacementDescriptor =
            [UIFontDescriptor fontDescriptorWithName:replacementName size:size];
        UIFontDescriptor *fallbackDescriptor =
            [replacementDescriptor fontDescriptorByAddingAttributes:@{
                UIFontDescriptorNameAttribute : name
            }];
        UIFontDescriptor *finalDescriptor =
            [replacementDescriptor fontDescriptorByAddingAttributes:@{
                UIFontDescriptorCascadeListAttribute : @[ fallbackDescriptor ]
            }];

        UIFont *font = [UIFont fontWithDescriptor:finalDescriptor size:size];
        if (font) return font;
    }
    return %orig;
}

+ (UIFont *)fontWithDescriptor:(UIFontDescriptor *)descriptor size:(CGFloat)size
{
    NSString *postscriptName  = descriptor.postscriptName;
    NSString *replacementName = postscriptName ? fontMap[postscriptName] : nil;
    if (replacementName)
    {
        UIFontDescriptor *replacementDescriptor =
            [UIFontDescriptor fontDescriptorWithName:replacementName size:size];
        UIFontDescriptor *finalDescriptor =
            [replacementDescriptor fontDescriptorByAddingAttributes:@{
                UIFontDescriptorCascadeListAttribute : @[ descriptor ]
            }];

        return %orig(finalDescriptor, size);
    }
    return %orig;
}

+ (UIFont *)systemFontOfSize:(CGFloat)size
{
    NSString *replacementName = fontMap[@"systemFont"];
    UIFont *font = replacementName ? [UIFont fontWithName:replacementName size:size] : nil;
    return font ?: %orig;
}

+ (UIFont *)preferredFontForTextStyle:(UIFontTextStyle)style
{
    UIFont *original = %orig;
    NSString *replacementName = fontMap[@"systemFont"];
    // At the size of the user's text size setting
    UIFont *font = replacementName ? [UIFont fontWithName:replacementName size:original.pointSize] : nil;
    return font ?: original;
}

%end

/** Registers a font's file with the system and maps Discord's font to it */
static void registerFont(NSString *fontName, NSData *fontData)
{
    CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef) fontData);
    CGFontRef font = provider ? CGFontCreateWithDataProvider(provider) : NULL;
    if (provider) CGDataProviderRelease(provider);
    if (!font)
    {
        BunnyLog(@"The file for font %@ isn't a font", fontName);
        return;
    }

    CFStringRef postScriptName = CGFontCopyPostScriptName(font);
    CFErrorRef error = NULL;
    BOOL registered = CTFontManagerRegisterGraphicsFont(font, &error);
    // One registered before, by another font that uses the same file, can be used all the same
    if (!registered && error && CFErrorGetCode(error) == kCTFontManagerErrorAlreadyRegistered) registered = YES;

    if (registered && postScriptName)
    {
        fontMap[fontName] = (__bridge NSString *) postScriptName;
        BunnyLog(@"Registered font %@ as %@", fontName, (__bridge NSString *) postScriptName);
    }
    else
    {
        NSString *description = error ? CFBridgingRelease(CFErrorCopyDescription(error)) : @"no PostScript name";
        BunnyLog(@"Failed to register font %@: %@", fontName, description);
    }

    if (error) CFRelease(error);
    if (postScriptName) CFRelease(postScriptName);
    CFRelease(font);
}

/**
 * Downloads font files the bundle didn't manage to save, in the background: Discord's launch can't wait for them, so
 * they apply the next time it starts
 */
static void downloadMissingFonts(NSDictionary<NSURL *, NSURL *> *missing)
{
    NSURLSession *session = [NSURLSession sessionWithConfiguration:NSURLSessionConfiguration.ephemeralSessionConfiguration];
    [missing enumerateKeysAndObjectsUsingBlock:^(NSURL *path, NSURL *url, BOOL *stop) {
        [[session dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
            NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 0;
            if (data.length && status == 200)
            {
                [data writeToURL:path atomically:YES];
                BunnyLog(@"Downloaded font %@; it applies the next time Discord starts", path.lastPathComponent);
            }
            else
            {
                BunnyLog(@"Couldn't download font %@: %@", url, error.localizedDescription ?: @(status));
            }
        }] resume];
    }];
    [session finishTasksAndInvalidate];
}

// fonts.json is the selected font as the bundle saves it (lib/addons/fonts): { name, main: { <Discord's font>: <link> } },
// with each file in downloads/fonts/<name>/<font>.<ttf or otf>
void patchFonts(NSDictionary<NSString *, NSString *> *mainFonts, NSString *fontDefName)
{
    if (![mainFonts isKindOfClass:NSDictionary.class] || !isSafeFileName(fontDefName))
    {
        BunnyLog(@"fonts.json has no font Endcord can use");
        return;
    }

    if (!fontMap)
    {
        fontMap = [NSMutableDictionary dictionary];
    }

    NSURL *fontFolder = [[[getPyoncordDirectory() URLByAppendingPathComponent:@"downloads" isDirectory:YES]
        URLByAppendingPathComponent:@"fonts"
                        isDirectory:YES] URLByAppendingPathComponent:fontDefName
                                                         isDirectory:YES];
    NSMutableDictionary<NSURL *, NSURL *> *missing = [NSMutableDictionary dictionary];

    for (NSString *fontName in mainFonts)
    {
        NSString *link = mainFonts[fontName];
        NSURL *url = [link isKindOfClass:NSString.class] ? [NSURL URLWithString:link] : nil;
        NSString *scheme = url.scheme.lowercaseString;
        if (!isSafeFileName(fontName) || !([scheme isEqualToString:@"https"] || [scheme isEqualToString:@"http"]))
        {
            BunnyLog(@"Skipping font %@ of %@: its name or link can't be used", fontName, fontDefName);
            continue;
        }

        NSURL *fontPath = [fontFolder
            URLByAppendingPathComponent:[NSString stringWithFormat:@"%@.%@", fontName, fontFileExtension(link)]];
        NSData *fontData = [NSData dataWithContentsOfURL:fontPath];
        if (fontData)
        {
            registerFont(fontName, fontData);
        }
        else
        {
            missing[fontPath] = url;
        }
    }

    if (missing.count)
    {
        [[NSFileManager defaultManager] createDirectoryAtURL:fontFolder
                                 withIntermediateDirectories:YES
                                                  attributes:nil
                                                       error:nil];
        downloadMissingFonts(missing);
    }
}

%ctor
{
    @autoreleasepool
    {
        fontMap = [NSMutableDictionary dictionary];

        // Safe mode turns fonts off, as the bundle's fonts page says
        NSDictionary *fontDict = isSafeModeEnabled()
                                     ? nil
                                     : readJSONFile([getPyoncordDirectory() URLByAppendingPathComponent:@"fonts.json"]);
        if ([fontDict isKindOfClass:NSDictionary.class] && fontDict[@"main"])
        {
            BunnyLog(@"Applying fonts before hooks...");
            patchFonts(fontDict[@"main"], fontDict[@"name"]);
        }

        %init;
    }
}
