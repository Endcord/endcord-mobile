#import <QuartzCore/QuartzCore.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

#import "Logger.h"
#import "SmoothCaret.h"
#import "Utils.h"

/*
 * SmoothType's caret in Discord's message box, like the Android loader's (SmoothCaret.kt): it glides to where the
 * cursor goes over the transition delay with the chosen easing, blinks once it has been still for a second, and has
 * its own color.
 *
 * Since iOS 17 a text view's cursor is a view of its UITextSelectionDisplayInteraction, which can be replaced: the
 * message box's is replaced by one that animates its moves. The bundle turns it on and sets it with the
 * `endcord.smoothType.configure` bridge method. Older iOS keeps its own cursor.
 */

static const CFTimeInterval kBlinkAfter  = 1.0;
static const CFTimeInterval kBlinkPeriod = 1.0;

// Read and written on the main thread
static BOOL gEnabled;
static UIColor *gColor;
static CFTimeInterval gDuration = 0.06;
static CAMediaTimingFunction *gTiming;
/** The message boxes seen so far */
static NSHashTable<UITextView *> *gTextViews;
static const void *kSystemCursorKey = &kSystemCursorKey;

// What iOS 17's UIKit has, which the SDK this builds with doesn't declare
@protocol EndcordSelectionDisplay <NSObject>
- (UIView *)cursorView;
- (void)setCursorView:(UIView *)cursorView;
@optional
- (void)setNeedsSelectionUpdate;
@end

/** CSS's timing functions, which Endcord PC's caret transition uses */
static CAMediaTimingFunction *timingNamed(NSString *name)
{
    if ([name isEqualToString:@"linear"]) return [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionLinear];
    if ([name isEqualToString:@"ease-in"]) return [CAMediaTimingFunction functionWithControlPoints:0.42 :0 :1 :1];
    if ([name isEqualToString:@"ease-out"]) return [CAMediaTimingFunction functionWithControlPoints:0 :0 :0.58 :1];
    if ([name isEqualToString:@"ease-in-out"]) return [CAMediaTimingFunction functionWithControlPoints:0.42 :0 :0.58 :1];
    return [CAMediaTimingFunction functionWithControlPoints:0.25 :0.1 :0.25 :1];
}

/** The cursor, as UIKit's UITextCursorView: UIKit places it, tells it when to blink, and it glides to each place */
@interface EndcordCaretView : UIView
@property (nonatomic, assign, getter=isBlinking) BOOL blinking;
- (void)resetBlinkAnimation;
- (void)applySettings;
@end

@implementation EndcordCaretView
{
    BOOL _moving;
    /** Whether the move being made glides: not when the caret appears, which it does where it is */
    BOOL _glide;
    BOOL _placed;
}

- (instancetype)initWithFrame:(CGRect)frame
{
    if ((self = [super initWithFrame:frame]))
    {
        self.userInteractionEnabled = NO;
        [self applySettings];
    }
    return self;
}

- (void)applySettings
{
    self.backgroundColor = gColor;
}

- (void)layoutSubviews
{
    [super layoutSubviews];
    self.layer.cornerRadius = MIN(self.bounds.size.width, self.bounds.size.height) / 2;
}

- (void)setBlinking:(BOOL)blinking
{
    _blinking = blinking;
    [self resetBlinkAnimation];
}

- (void)resetBlinkAnimation
{
    [self.layer removeAnimationForKey:@"endcordBlink"];
    if (!_blinking) return;
    // Solid for a second, then fades out and in once a second
    CAKeyframeAnimation *blink = [CAKeyframeAnimation animationWithKeyPath:@"opacity"];
    blink.values          = @[ @1, @0, @1 ];
    blink.keyTimes        = @[ @0, @0.5, @1 ];
    CAMediaTimingFunction *fade = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
    blink.timingFunctions = @[ fade, fade ];
    blink.duration        = kBlinkPeriod;
    blink.repeatCount     = HUGE_VALF;
    blink.beginTime       = [self.layer convertTime:CACurrentMediaTime() fromLayer:nil] + kBlinkAfter;
    [self.layer addAnimation:blink forKey:@"endcordBlink"];
}

- (void)endcordMove:(void (^)(void))change
{
    if (_moving)
    {
        change();
        return;
    }
    _moving = YES;
    _glide  = _placed && !self.hidden && self.window && gDuration > 0;
    change();
    _glide  = NO;
    _moving = NO;
    _placed = self.window && !self.hidden;
    if (_blinking) [self resetBlinkAnimation];
}

- (void)setFrame:(CGRect)frame
{
    if (CGRectEqualToRect(frame, self.frame))
        [super setFrame:frame];
    else
        [self endcordMove:^{ [super setFrame:frame]; }];
}

- (void)setCenter:(CGPoint)center
{
    if (CGPointEqualToPoint(center, self.center))
        [super setCenter:center];
    else
        [self endcordMove:^{ [super setCenter:center]; }];
}

- (void)setBounds:(CGRect)bounds
{
    if (CGRectEqualToRect(bounds, self.bounds))
        [super setBounds:bounds];
    else
        [self endcordMove:^{ [super setBounds:bounds]; }];
}

- (void)setHidden:(BOOL)hidden
{
    [super setHidden:hidden];
    if (hidden) _placed = NO;
}

- (void)didMoveToWindow
{
    [super didMoveToWindow];
    if (!self.window) _placed = NO;
}

// A move glides from wherever the caret is on screen, mid-glide too, to the new place
- (id<CAAction>)actionForLayer:(CALayer *)layer forKey:(NSString *)event
{
    if (_glide && layer == self.layer && ([event isEqualToString:@"position"] || [event isEqualToString:@"bounds"]))
    {
        CABasicAnimation *glide = [CABasicAnimation animationWithKeyPath:event];
        CALayer *shown          = layer.presentationLayer ?: layer;
        glide.fromValue         = [shown valueForKey:event];
        glide.duration          = gDuration;
        glide.timingFunction    = gTiming;
        return glide;
    }
    return [super actionForLayer:layer forKey:event];
}

@end

/** Whether a text view is Discord's message box (DCDChatInput, a native component), or inside it */
static BOOL isChatInput(UIView *view)
{
    for (NSInteger depth = 0; view && depth < 8; depth++, view = view.superview)
    {
        if ([NSStringFromClass(view.class) hasPrefix:@"DCDChatInput"]) return YES;
    }
    return NO;
}

static id<EndcordSelectionDisplay> selectionDisplay(UIView *view, NSInteger depth)
{
    static Class interactionClass;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ interactionClass = NSClassFromString(@"UITextSelectionDisplayInteraction"); });
    if (!interactionClass || !view) return nil;

    for (id<UIInteraction> interaction in view.interactions)
    {
        if ([interaction isKindOfClass:interactionClass] && [interaction respondsToSelector:@selector(setCursorView:)])
            return (id<EndcordSelectionDisplay>)interaction;
    }
    if (depth <= 0) return nil;
    for (UIView *subview in view.subviews)
    {
        id<EndcordSelectionDisplay> found = selectionDisplay(subview, depth - 1);
        if (found) return found;
    }
    return nil;
}

/** Puts in or takes out the caret, as SmoothType is now */
static void applyCaret(UITextView *textView)
{
    id<EndcordSelectionDisplay> display = selectionDisplay(textView, 3);
    if (!display) return;

    @try
    {
        UIView *cursor = display.cursorView;
        if (gEnabled)
        {
            if (![cursor isKindOfClass:EndcordCaretView.class])
            {
                if (cursor) objc_setAssociatedObject(textView, kSystemCursorKey, cursor, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
                cursor = [[EndcordCaretView alloc] initWithFrame:cursor ? cursor.frame : CGRectZero];
                display.cursorView = cursor;
            }
            [(EndcordCaretView *)cursor applySettings];
        }
        else if ([cursor isKindOfClass:EndcordCaretView.class])
        {
            UIView *system = objc_getAssociatedObject(textView, kSystemCursorKey);
            if (!system) return;
            display.cursorView = system;
            objc_setAssociatedObject(textView, kSystemCursorKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        }
        if ([display respondsToSelector:@selector(setNeedsSelectionUpdate)]) [display setNeedsSelectionUpdate];
    }
    @catch (NSException *exception)
    {
        BunnyLog(@"SmoothType couldn't set the caret: %@", exception.reason);
    }
}

void configureSmoothCaret(NSArray *args)
{
    id enabled = args.count > 0 ? args[0] : nil;
    id color   = args.count > 1 ? args[1] : nil;
    id delay   = args.count > 2 ? args[2] : nil;
    id easing  = args.count > 3 ? args[3] : nil;

    dispatch_async(dispatch_get_main_queue(), ^{
        gEnabled = [enabled isKindOfClass:NSNumber.class] && [enabled boolValue];
        if ([color isKindOfClass:NSNumber.class])
        {
            NSInteger rgb = [color integerValue] & 0xFFFFFF;
            gColor = [UIColor colorWithRed:((rgb >> 16) & 0xFF) / 255.0
                                     green:((rgb >> 8) & 0xFF) / 255.0
                                      blue:(rgb & 0xFF) / 255.0
                                     alpha:1];
        }
        if ([delay isKindOfClass:NSNumber.class]) gDuration = MIN(MAX([delay doubleValue], 0), 2000) / 1000;
        if ([easing isKindOfClass:NSString.class]) gTiming = timingNamed(easing);

        for (UITextView *textView in gTextViews.allObjects) applyCaret(textView);
    });
}

%hook UITextView

// The selection display is made when the box is first edited
- (BOOL)becomeFirstResponder
{
    BOOL became = %orig;
    if (became && isChatInput(self))
    {
        [gTextViews addObject:self];
        if (gEnabled)
        {
            UITextView *textView = self;
            dispatch_async(dispatch_get_main_queue(), ^{ applyCaret(textView); });
        }
    }
    return became;
}

%end

%ctor
{
    if (isAppExtension()) return;

    gColor     = UIColor.whiteColor;
    gTiming    = timingNamed(@"ease");
    gTextViews = [NSHashTable weakObjectsHashTable];
    // UIKit checks a cursor view is one
    Protocol *cursorProtocol = objc_getProtocol("UITextCursorView");
    if (cursorProtocol) class_addProtocol(EndcordCaretView.class, cursorProtocol);
    %init;
}
