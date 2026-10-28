#import <Foundation/Foundation.h>
#import <objc/message.h>

#import "Logger.h"
#import "Utils.h"

#ifdef __cplusplus
extern "C" {
#endif

void initializeThemeColors(NSDictionary *semanticColors, NSDictionary *rawColors);

#ifdef __cplusplus
}
#endif

#define CURRENT_THEME [NSString stringWithFormat:@"%@/%@", NSHomeDirectory(), @"Documents/pyoncord/current-theme.json"]
