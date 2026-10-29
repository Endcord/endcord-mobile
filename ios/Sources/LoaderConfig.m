#import "LoaderConfig.h"
#import "Logger.h"
#import "Utils.h"

#define DEFAULT_CUSTOM_URL @"http://localhost:4040/endcord.min.js"

static NSURL *loaderConfigURL(void) {
    return [getPyoncordDirectory() URLByAppendingPathComponent:@"loader.json"];
}

@implementation LoaderConfig

- (instancetype)init {
    self = [super init];
    if (self) {
        self.customLoadUrlEnabled = NO;
        self.customLoadUrl        = [NSURL URLWithString:DEFAULT_CUSTOM_URL];
    }
    return self;
}

// loader.json as the bundle writes it (lib/api/settings.ts): { customLoadUrl: { enabled, url } }. Anything else in it,
// or a file someone broke, leaves the defaults
- (BOOL)loadConfig {
    NSDictionary *json = readJSONFile(loaderConfigURL());
    if (![json isKindOfClass:[NSDictionary class]]) {
        BunnyLog(@"Using the default loader config");
        return NO;
    }

    NSDictionary *customLoadUrl = json[@"customLoadUrl"];
    if ([customLoadUrl isKindOfClass:[NSDictionary class]]) {
        id enabled                = customLoadUrl[@"enabled"];
        self.customLoadUrlEnabled = [enabled isKindOfClass:[NSNumber class]] && [enabled boolValue];
        id urlString              = customLoadUrl[@"url"];
        NSURL *url = [urlString isKindOfClass:[NSString class]] ? [NSURL URLWithString:urlString] : nil;
        if (url.scheme && url.host) {
            self.customLoadUrl = url;
        } else if (self.customLoadUrlEnabled) {
            BunnyLog(@"The custom bundle URL %@ isn't a link; loading the default bundle", urlString);
            self.customLoadUrlEnabled = NO;
        }
    }

    BunnyLog(@"Loader config loaded - Custom URL %@: %@", self.customLoadUrlEnabled ? @"enabled" : @"disabled",
             self.customLoadUrl.absoluteString);
    return YES;
}

+ (instancetype)defaultConfig {
    return [[LoaderConfig alloc] init];
}

+ (instancetype)getLoaderConfig {
    LoaderConfig *config = [[LoaderConfig alloc] init];
    [config loadConfig];
    return config;
}

// Keeps what else the bundle has in the file, such as loadReactDevTools
- (BOOL)saveConfig {
    NSDictionary *saved       = readJSONFile(loaderConfigURL());
    NSMutableDictionary *json = [saved isKindOfClass:[NSDictionary class]] ? [saved mutableCopy]
                                                                          : [NSMutableDictionary dictionary];
    json[@"customLoadUrl"] = @{
        @"enabled" : @(self.customLoadUrlEnabled),
        @"url" : self.customLoadUrl.absoluteString ?: DEFAULT_CUSTOM_URL
    };

    NSData *data = [NSJSONSerialization dataWithJSONObject:json options:0 error:nil];
    return [data writeToURL:loaderConfigURL() atomically:YES];
}

@end
