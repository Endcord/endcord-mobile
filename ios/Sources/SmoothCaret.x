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

/** What's seen of the caret: a view beside the cursor view, which UIKit knows nothing about and so leaves alone */
@interface EndcordCaretGlyph : UIView
@end

@implementation EndcordCaretGlyph
@end

/**
 * The cursor, as UIKit's UITextCursorView. UIKit moves, hides and blinks it as it likes, with animations of its own
 * turned off, so it's only where the caret should be: it stays clear, and each frame the glyph glides to it.
 */
@interface EndcordCaretView : UIView
@property (nonatomic, assign, getter=isBlinking) BOOL blinking;
- (void)resetBlinkAnimation;
- (void)applySettings;
@end

@implementation EndcordCaretView
{
    EndcordCaretGlyph *_glyph;
    CADisplayLink *_link;
    /** Where the glyph was last sent; a caret that appears does so where it is, without gliding there */
    CGRect _target;
    BOOL _placed;
}

- (instancetype)initWithFrame:(CGRect)frame
{
    if ((self = [super initWithFrame:frame]))
    {
        self.userInteractionEnabled  = NO;
        self.backgroundColor         = UIColor.clearColor;
        _glyph                       = [EndcordCaretGlyph new];
        _glyph.userInteractionEnabled = NO;
        [self applySettings];
    }
    return self;
}

- (void)applySettings
{
    _glyph.backgroundColor = gColor;
}

- (void)setBlinking:(BOOL)blinking
{
    _blinking = blinking;
    [self resetBlinkAnimation];
}

- (void)resetBlinkAnimation
{
    [_glyph.layer removeAnimationForKey:@"endcordBlink"];
    if (!_blinking) return;
    // Solid for a second, then fades out and in once a second
    CAKeyframeAnimation *blink = [CAKeyframeAnimation animationWithKeyPath:@"opacity"];
    blink.values          = @[ @1, @0, @1 ];
    blink.keyTimes        = @[ @0, @0.5, @1 ];
    CAMediaTimingFunction *fade = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
    blink.timingFunctions = @[ fade, fade ];
    blink.duration        = kBlinkPeriod;
    blink.repeatCount     = HUGE_VALF;
    blink.beginTime       = [_glyph.layer convertTime:CACurrentMediaTime() fromLayer:nil] + kBlinkAfter;
    [_glyph.layer addAnimation:blink forKey:@"endcordBlink"];
}

- (void)glide:(NSString *)keyPath from:(id)from
{
    id to = [_glyph.layer valueForKey:keyPath];
    if ([from isEqual:to]) return;
    CABasicAnimation *glide = [CABasicAnimation animationWithKeyPath:keyPath];
    glide.fromValue         = from;
    glide.toValue           = to;
    glide.duration          = gDuration;
    glide.timingFunction    = gTiming;
    [_glyph.layer addAnimation:glide forKey:[@"endcordGlide." stringByAppendingString:keyPath]];
}

- (void)follow
{
    CGRect target = self.frame;
    _glyph.alpha  = self.alpha;
    // Discord's message box gives an empty rect while its cursor shouldn't show (shouldShowCursor); it comes back
    // where it is
    if (CGRectIsEmpty(target))
    {
        _glyph.hidden = YES;
        _placed       = NO;
        return;
    }
    _glyph.hidden = NO;
    if (_placed && CGRectEqualToRect(target, _target)) return;

    // From where it is on screen, mid-glide too
    CALayer *layer  = _glyph.layer;
    CALayer *shown  = layer.presentationLayer ?: layer;
    id fromPosition = [shown valueForKey:@"position"];
    id fromBounds   = [shown valueForKey:@"bounds"];
    BOOL glide      = _placed && gDuration > 0;

    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    layer.bounds       = CGRectMake(0, 0, target.size.width, target.size.height);
    layer.position     = CGPointMake(CGRectGetMidX(target), CGRectGetMidY(target));
    layer.cornerRadius = MIN(target.size.width, target.size.height) / 2;
    if (glide)
    {
        [self glide:@"position" from:fromPosition];
        [self glide:@"bounds" from:fromBounds];
    }
    [CATransaction commit];

    _target = target;
    _placed = YES;
    if (_blinking) [self resetBlinkAnimation];
}

/** Follows while it can be seen */
- (void)updateLink
{
    BOOL shown = self.window && !self.hidden;
    _glyph.hidden = !shown;
    if (shown && !_link)
    {
        [self follow];
        _link = [CADisplayLink displayLinkWithTarget:self selector:@selector(follow)];
        [_link addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
    }
    else if (!shown && _link)
    {
        [_link invalidate];
        _link   = nil;
        _placed = NO;
    }
}

- (void)setHidden:(BOOL)hidden
{
    [super setHidden:hidden];
    [self updateLink];
}

- (void)didMoveToSuperview
{
    [super didMoveToSuperview];
    if (self.superview)
        [self.superview insertSubview:_glyph aboveSubview:self];
    else
        [_glyph removeFromSuperview];
}

- (void)didMoveToWindow
{
    [super didMoveToWindow];
    [self updateLink];
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

/**
 * Gives the selection display another cursor view. Where it takes the new one without putting it where the old one
 * was, it goes there.
 */
static void swapCursor(id<EndcordSelectionDisplay> display, UIView *from, UIView *to)
{
    UIView *container = from.superview;
    NSUInteger index  = container ? [container.subviews indexOfObject:from] : NSNotFound;
    display.cursorView = to;
    BOOL taken = display.cursorView == to;
    if (taken && !to.superview && container)
    {
        if (index == NSNotFound) index = container.subviews.count;
        [container insertSubview:to atIndex:MIN(index, container.subviews.count)];
        [from removeFromSuperview];
    }
    BunnyLog(@"SmoothType: %@ -> %@, taken %d, in %@", NSStringFromClass(from.class), NSStringFromClass(to.class), taken,
             NSStringFromClass(to.superview.class));
}

/** Puts in or takes out the caret, as SmoothType is now */
static void applyCaret(UITextView *textView)
{
    id<EndcordSelectionDisplay> display = selectionDisplay(textView, 3);
    if (!display)
    {
        BunnyLog(@"SmoothType: no selection display in %@", NSStringFromClass(textView.class));
        return;
    }

    @try
    {
        UIView *cursor = display.cursorView;
        if (gEnabled)
        {
            if (![cursor isKindOfClass:EndcordCaretView.class])
            {
                if (cursor) objc_setAssociatedObject(textView, kSystemCursorKey, cursor, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
                UIView *caret = [[EndcordCaretView alloc] initWithFrame:cursor ? cursor.frame : CGRectZero];
                swapCursor(display, cursor, caret);
                cursor = caret;
            }
            [(EndcordCaretView *)cursor applySettings];
        }
        else if ([cursor isKindOfClass:EndcordCaretView.class])
        {
            UIView *system = objc_getAssociatedObject(textView, kSystemCursorKey);
            if (!system) return;
            swapCursor(display, cursor, system);
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

        BunnyLog(@"SmoothType: caret %@, %lu message boxes seen", gEnabled ? @"on" : @"off",
                 (unsigned long)gTextViews.allObjects.count);
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
        BunnyLog(@"SmoothType: message box focused (%@), caret %@", NSStringFromClass(self.class), gEnabled ? @"on" : @"off");
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
