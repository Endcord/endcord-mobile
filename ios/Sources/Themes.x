#import "Themes.h"

// The current theme's colors, read on any thread while Discord draws. A theme applied again (after a reload) replaces
// them, and the ones it replaces are kept alive, so a thread that read the old dictionary can still use it.
static NSDictionary *gSemanticColors = nil;
static NSDictionary *gRawColors      = nil;
static NSMutableArray *gReplacedColors = nil;
static NSMutableSet *loggedColors    = nil;

static NSInteger getThemeIndex(void) {
    Class DCDTheme = NSClassFromString(@"DCDTheme");
    if (!DCDTheme)
        return 0;

    SEL themeIndexSelector = NSSelectorFromString(@"themeIndex");
    if (![DCDTheme respondsToSelector:themeIndexSelector])
        return 0;

    typedef NSInteger (*ThemeIndexFunc)(id, SEL);
    return ((ThemeIndexFunc)objc_msgSend)(DCDTheme, themeIndexSelector);
}

static NSString *camelToSnakeCase(NSString *input) {
    NSMutableString *output   = [NSMutableString string];
    NSCharacterSet *uppercase = [NSCharacterSet uppercaseLetterCharacterSet];

    for (NSUInteger i = 0; i < input.length; i++) {
        unichar c = [input characterAtIndex:i];
        if (i > 0 && [uppercase characterIsMember:c]) {
            [output appendString:@"_"];
        }
        [output appendString:[[NSString stringWithCharacters:&c length:1] uppercaseString]];
    }
    return output;
}

/**
 * A semantic color for Discord's current theme. Themes give one per theme, dark and light (the bundle keeps those two,
 * lib/addons/themes/colors/parser.ts), so Discord's other dark themes take the dark one.
 */
static UIColor *semanticColor(NSDictionary *semanticColors, NSString *key) {
    NSArray *colors = semanticColors[key];
    if (![colors isKindOfClass:[NSArray class]] || colors.count == 0)
        return nil;

    NSInteger index = getThemeIndex();
    if (index < 0 || index >= (NSInteger)colors.count) {
        if (index == 1)
            return nil;
        index = 0;
    }
    return hexToUIColor(colors[index]);
}

static void logColorOnce(NSString *name, NSString *kind) {
    @synchronized(loggedColors) {
        if ([loggedColors containsObject:name])
            return;
        [loggedColors addObject:name];
    }
    BunnyLog(@"Applied %@ color: %@", kind, name);
}

/**
 * Whether a theme's raw color can be one of UIColor's class methods: only a name that can't be any other method
 * (+alloc, +new, a method with arguments), and only one UIColor has itself, not one it inherits from NSObject, that
 * takes nothing and returns an object. A theme is data from anyone; it mustn't be able to break Discord.
 */
static BOOL canReplaceRawColor(NSString *key, Method *existing) {
    static NSRegularExpression *pattern;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        pattern = [NSRegularExpression regularExpressionWithPattern:@"^[A-Z][A-Z0-9_]*$" options:0 error:nil];
    });
    if (![key isKindOfClass:[NSString class]] ||
        [pattern numberOfMatchesInString:key options:0 range:NSMakeRange(0, key.length)] == 0)
        return NO;

    *existing = NULL;
    Class metaClass       = object_getClass([UIColor class]);
    SEL selector          = NSSelectorFromString(key);
    unsigned int count    = 0;
    Method *methods       = class_copyMethodList(metaClass, &count);
    for (unsigned int i = 0; i < count; i++) {
        if (method_getName(methods[i]) == selector) {
            *existing = methods[i];
            break;
        }
    }
    free(methods);

    if (!*existing)
        return !class_getClassMethod([UIColor class], selector);

    char returnType[8];
    method_getReturnType(*existing, returnType, sizeof(returnType));
    return method_getNumberOfArguments(*existing) == 2 && returnType[0] == '@';
}

static void swizzleRawColorMethods(NSDictionary *rawColors) {
    static NSMutableSet *swizzled;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ swizzled = [NSMutableSet new]; });

    BunnyLog(@"Processing %lu raw color methods", (unsigned long)rawColors.count);

    for (NSString *key in rawColors) {
        if ([swizzled containsObject:key])
            continue;

        Method existingMethod = NULL;
        if (!canReplaceRawColor(key, &existingMethod)) {
            BunnyLog(@"Skipping raw color %@: it isn't a color name", key);
            continue;
        }
        [swizzled addObject:key];

        SEL selector  = NSSelectorFromString(key);
        IMP original  = existingMethod ? method_getImplementation(existingMethod) : NULL;
        IMP implementation = imp_implementationWithBlock(^UIColor *(id self) {
            UIColor *color = hexToUIColor(gRawColors[key]);
            if (color) {
                logColorOnce(key, @"raw");
                return color;
            }
            return original ? ((UIColor * (*)(id, SEL)) original)(self, selector) : [UIColor clearColor];
        });

        if (existingMethod) {
            method_setImplementation(existingMethod, implementation);
        } else {
            class_addMethod(object_getClass([UIColor class]), selector, implementation, "@16@0:8");
        }
    }
}

// Once: the replacements read the theme at the time Discord asks for a color
static void swizzleDCDThemeColorMethods(void) {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        Class targetClass = objc_getClass("DCDThemeColor");
        if (!targetClass)
            return;

        unsigned int methodCount = 0;
        Method *methods          = class_copyMethodList(object_getClass(targetClass), &methodCount);
        if (!methods)
            return;

        for (unsigned int i = 0; i < methodCount; i++) {
            Method method = methods[i];
            char returnType[256];
            method_getReturnType(method, returnType, sizeof(returnType));
            if (strcmp(returnType, @encode(UIColor *)) != 0 || method_getNumberOfArguments(method) != 2)
                continue;

            SEL selector       = method_getName(method);
            NSString *name     = NSStringFromSelector(selector);
            NSString *snakeKey = camelToSnakeCase(name);
            IMP original       = method_getImplementation(method);

            IMP replacement = imp_implementationWithBlock(^UIColor *(id self) {
                UIColor *color = semanticColor(gSemanticColors, snakeKey);
                if (color) {
                    logColorOnce(name, @"theme");
                    return color;
                }
                return ((UIColor * (*)(id, SEL)) original)(self, selector);
            });

            method_setImplementation(method, replacement);
        }

        free(methods);
    });
}

/** The keyboard's color in the current theme, or nil to leave the keyboard as Discord has it */
static UIColor *keyboardColor(void) {
    NSDictionary *colors = gSemanticColors;
    if (colors.count == 0)
        return nil;
    return semanticColor(colors, @"KEYBOARD") ?: semanticColor(colors, @"BACKGROUND_PRIMARY");
}

static BOOL isThemeLight(UIColor *color) {
    CGFloat r = 0, g = 0, b = 0;
    if (![color getRed:&r green:&g blue:&b alpha:NULL])
        return NO;
    CGFloat luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.70;
}

@interface UIKeyboard : UIView
@end

@interface UIKeyboardDockView : UIView
@end

@interface TUIPredictionView : UIView
@end

@interface TUIEmojiSearchInputView : UIView
@end

@interface UIKBRenderConfig : NSObject
-(void)setLightKeyboard:(BOOL)light;
+(void)refreshKeyboard;
+(id)darkConfig;
+(id)defaultConfig;
+(id)defaultEmojiConfig;
+(id)lowQualityDarkConfig;
@end

// Without a theme with colors for it, the keyboard is left alone
%group KEYBOARD

	%hook UIKeyboard
	- (void)didMoveToWindow {
		%orig;

		UIColor *color = keyboardColor();
		if (color) {
			[%c(UIKBRenderConfig) refreshKeyboard];
			[self setBackgroundColor:color];
		}
	}

	%end

	%hook UIKeyboardDockView

	- (void)didMoveToWindow {
		%orig;

		UIColor *color = keyboardColor();
		if (color)
			[self setBackgroundColor:color];
	}

	%end

	%hook UIKBRenderConfig

	- (void)setLightKeyboard:(BOOL)arg1 {
		UIColor *color = keyboardColor();
		%orig(color ? isThemeLight(color) : arg1);
	}

	%new
	+(void)refreshKeyboard {
		[[self darkConfig] setLightKeyboard:TRUE];
		[[self defaultConfig] setLightKeyboard:TRUE];
		[[self defaultEmojiConfig] setLightKeyboard:TRUE];
		[[self lowQualityDarkConfig] setLightKeyboard:TRUE];
	}

	%end

	%hook TUIPredictionView
	- (void)didMoveToWindow {
		%orig;

		UIColor *color = keyboardColor();
		if (color) {
			[self setBackgroundColor:color];
			for (UIView *subview in self.subviews) {
				[subview setBackgroundColor:color];
			}
		}
	}
	%end

	%hook TUIEmojiSearchInputView

	- (void)didMoveToWindow {
		%orig;

		UIColor *color = keyboardColor();
		if (color)
			[self setBackgroundColor:color];
	}
	%end

%end

void initializeThemeColors(NSDictionary *semanticColors, NSDictionary *rawColors) {
    semanticColors = [semanticColors isKindOfClass:[NSDictionary class]] ? semanticColors : @{};
    rawColors      = [rawColors isKindOfClass:[NSDictionary class]] ? rawColors : @{};
    if (semanticColors.count == 0 && rawColors.count == 0)
        return;

    BunnyLog(@"Initializing theme (%lu semantic colors, %lu raw colors)",
             (unsigned long)semanticColors.count, (unsigned long)rawColors.count);

    @synchronized([UIColor class]) {
        if (!gReplacedColors)
            gReplacedColors = [NSMutableArray new];
        if (gSemanticColors)
            [gReplacedColors addObject:gSemanticColors];
        if (gRawColors)
            [gReplacedColors addObject:gRawColors];
        if (!loggedColors)
            loggedColors = [NSMutableSet new];

        gSemanticColors = [semanticColors copy];
        gRawColors      = [rawColors copy];

        swizzleDCDThemeColorMethods();
        swizzleRawColorMethods(gRawColors);
    }
}

%ctor {
    if (isAppExtension()) return;

    NSBundle* bundle = [NSBundle bundleWithPath:@"/System/Library/PrivateFrameworks/TextInputUI.framework"];
	if (!bundle.loaded) [bundle load];

	%init(KEYBOARD);

}
