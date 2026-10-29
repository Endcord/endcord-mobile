#import "Settings.h"
#import "DeviceModels.h"
#import "Logger.h"
#import "Utils.h"
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

@implementation BunnySettingsViewController

- (instancetype)initWithVersion:(NSString *)version {
    self = [super init];
    if (self) {
        self.title = [NSString stringWithFormat:@"Endcord v%@ Recovery Menu", version];
    }
    return self;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.systemGroupedBackgroundColor;

    UITableView *tableView = [[UITableView alloc] initWithFrame:self.view.bounds
                                                          style:UITableViewStyleInsetGrouped];
    tableView.translatesAutoresizingMaskIntoConstraints = NO;
    tableView.delegate                                  = self;
    tableView.dataSource                                = self;
    [self.view addSubview:tableView];

    [NSLayoutConstraint activateConstraints:@[
        [tableView.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],
        [tableView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [tableView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [tableView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor]
    ]];
}

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView {
    return 1;
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    return 9;
}

- (UITableViewCell *)tableView:(UITableView *)tableView
         cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [tableView dequeueReusableCellWithIdentifier:@"Cell"];
    if (!cell) {
        cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleDefault
                                      reuseIdentifier:@"Cell"];
    }

    NSArray *options = @[
        @{@"title" : @"Toggle Safe Mode", @"icon" : @"shield", @"destructive" : @NO}, @{
            @"title" : @"Refetch Bundle",
            @"icon" : @"arrow.triangle.2.circlepath",
            @"destructive" : @NO
        },
        @{@"title" : @"Load Custom Bundle", @"icon" : @"link.badge.plus", @"destructive" : @NO},
        @{@"title" : @"Reset Bundle", @"icon" : @"arrow.counterclockwise", @"destructive" : @YES},
        @{@"title" : @"Delete All Plugins", @"icon" : @"trash", @"destructive" : @YES},
        @{@"title" : @"Delete All Themes", @"icon" : @"trash", @"destructive" : @YES},
        @{@"title" : @"Delete All Mod Data", @"icon" : @"trash.fill", @"destructive" : @YES},
        @{@"title" : @"Open App Folder", @"icon" : @"folder", @"destructive" : @NO}, @{
            @"title" : @"Open GitHub Issue",
            @"icon" : @"exclamationmark.bubble",
            @"destructive" : @NO
        }
    ];

    NSDictionary *option = options[indexPath.row];
    cell.textLabel.text  = option[@"title"];

    UIImageConfiguration *config =
        [UIImageSymbolConfiguration configurationWithPointSize:22
                                                        weight:UIImageSymbolWeightRegular];
    UIImage *icon        = [UIImage systemImageNamed:option[@"icon"] withConfiguration:config];
    cell.imageView.image = icon;
    cell.imageView.tintColor =
        [option[@"destructive"] boolValue] ? UIColor.systemRedColor : UIColor.systemBlueColor;

    if (indexPath.row == 0) {
        cell.textLabel.text = isSafeModeEnabled() ? @"Disable Safe Mode" : @"Enable Safe Mode";
    }

    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath {
    [tableView deselectRowAtIndexPath:indexPath animated:YES];

    if (indexPath.row == 0) {
        toggleSafeMode();
        return;
    }

    void (^performAction)(void) = ^{
        switch (indexPath.row) {
        case 1:
            refetchBundle(self);
            break;
        case 2:
            [self loadCustomBundle];
            break;
        case 3:
            resetCustomBundleURL(self);
            break;
        case 4:
            deletePluginsAndReload(self);
            break;
        case 5:
            deleteThemesAndReload(self);
            break;
        case 6:
            deleteAllData(self);
            break;
        case 7:
            [self openDocumentsDirectory];
            break;
        case 8:
            [self openGitHub];
            break;
        }
    };

    if (indexPath.row != 2 && indexPath.row != 7 && indexPath.row != 8) {
        NSString *actionText;
        switch (indexPath.row) {
        case 1:
            actionText = @"refetch the bundle";
            break;
        case 3:
            actionText = @"reset the bundle";
            break;
        case 4:
            actionText = @"delete all plugins";
            break;
        case 5:
            actionText = @"delete all themes";
            break;
        case 6:
            actionText = @"delete all mod data";
            break;
        default:
            actionText = @"perform this action";
            break;
        }

        UIAlertController *alert = [UIAlertController
            alertControllerWithTitle:@"Confirm Action"
                             message:[NSString stringWithFormat:@"Are you sure you want to %@?",
                                                                actionText]
                      preferredStyle:UIAlertControllerStyleAlert];

        [alert addAction:[UIAlertAction actionWithTitle:@"Cancel"
                                                  style:UIAlertActionStyleCancel
                                                handler:nil]];
        [alert addAction:[UIAlertAction
                             actionWithTitle:@"Confirm"
                                       style:UIAlertActionStyleDestructive
                                     handler:^(UIAlertAction *action) { performAction(); }]];

        [self presentViewController:alert animated:YES completion:nil];
    } else {
        performAction();
    }
}

- (void)openDocumentsDirectory {
    if (isJailbroken) {
        NSString *filzaPath = [NSString stringWithFormat:@"filza://view%@", getPyoncordDirectory().path];
        NSURL *filzaURL = [NSURL URLWithString:[filzaPath stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLQueryAllowedCharacterSet]]];
        
        if ([[UIApplication sharedApplication] canOpenURL:filzaURL]) {
            [[UIApplication sharedApplication] openURL:filzaURL options:@{} completionHandler:nil];
            return;
        }
    }
    
    NSArray *paths = [[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask];
    NSURL *documentsUrl = [paths firstObject];
    
    NSString *sharedPath = [NSString stringWithFormat:@"shareddocuments://%@", documentsUrl.path];
    NSURL *sharedUrl = [NSURL URLWithString:sharedPath];
    
    [[UIApplication sharedApplication] openURL:sharedUrl options:@{} completionHandler:nil];
}

- (void)openGitHub {
    UIDevice *device      = [UIDevice currentDevice];
    NSString *deviceId    = getDeviceIdentifier();
    NSString *deviceModel = DEVICE_MODELS[deviceId] ?: deviceId;
    NSString *appVersion =
        [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
    NSString *buildNumber = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleVersion"];

    NSString *body =
        [NSString stringWithFormat:@"### Device Information\n"
                                    "- Device: %@\n"
                                    "- iOS Version: %@\n"
                                    "- Tweak Version: %@\n"
                                    "- App Version: %@ (%@)\n"
                                    "- Jailbroken: %@\n\n"
                                    "### Issue Description\n"
                                    "<!-- Describe your issue here -->\n\n"
                                    "### Steps to Reproduce\n"
                                    "1. \n2. \n3. \n\n"
                                    "### Expected Behavior\n\n"
                                    "### Actual Behavior\n",
                                   deviceModel, device.systemVersion, PACKAGE_VERSION, appVersion,
                                   buildNumber, isJailbroken ? @"Yes" : @"No"];

    NSString *encodedTitle = [@"bug(iOS): "
        stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet
                                                               URLQueryAllowedCharacterSet]];
    NSString *encodedBody =
        [body stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet
                                                                     URLQueryAllowedCharacterSet]];

    NSString *urlString = [NSString
        stringWithFormat:@"https://github.com/Endcord/endcord-mobile/issues/new?title=%@&body=%@",
                         encodedTitle, encodedBody];

    NSURL *url          = [NSURL URLWithString:urlString];
    [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:nil];
}

- (void)loadCustomBundle {
    UIAlertController *alert =
        [UIAlertController alertControllerWithTitle:@"Load Custom Bundle"
                                            message:@"Enter the URL for your custom bundle:"
                                     preferredStyle:UIAlertControllerStyleAlert];

    [alert addTextFieldWithConfigurationHandler:^(UITextField *textField) {
        textField.placeholder            = @"https://example.com/endcord.min.js";
        textField.keyboardType           = UIKeyboardTypeURL;
        textField.autocorrectionType     = UITextAutocorrectionTypeNo;
        textField.autocapitalizationType = UITextAutocapitalizationTypeNone;
    }];

    // An error is shown on its own; the recovery menu stays open to try again
    __weak UIAlertController *weakAlert = alert;
    UIAlertAction *loadAction = [UIAlertAction
        actionWithTitle:@"Load"
                  style:UIAlertActionStyleDefault
                handler:^(UIAlertAction *action) {
                    NSString *urlString = [weakAlert.textFields.firstObject.text
                        stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
                    NSURL *url = urlString.length ? [NSURL URLWithString:urlString] : nil;
                    NSString *scheme = url.scheme.lowercaseString;
                    if (!url.host || !([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"])) {
                        showErrorAlert(@"Invalid URL",
                                       @"Enter a link that starts with http:// or https://, like "
                                       @"https://example.com/endcord.min.js",
                                       nil);
                        return;
                    }

                    NSURLSession *session = [NSURLSession
                        sessionWithConfiguration:NSURLSessionConfiguration.ephemeralSessionConfiguration];
                    [[session
                          dataTaskWithURL:url
                        completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
                            dispatch_async(dispatch_get_main_queue(), ^{
                                NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class]
                                                       ? ((NSHTTPURLResponse *)response).statusCode
                                                       : 0;
                                if (error) {
                                    showErrorAlert(
                                        @"Connection Error",
                                        [NSString stringWithFormat:@"Could not reach the URL: %@",
                                                                   error.localizedDescription],
                                        nil);
                                } else if (status != 200 || data.length == 0) {
                                    showErrorAlert(
                                        @"Error",
                                        [NSString stringWithFormat:@"The server answered with HTTP %ld",
                                                                   (long)status],
                                        nil);
                                } else {
                                    setCustomBundleURL(url, self);
                                }
                            });
                        }] resume];
                    [session finishTasksAndInvalidate];
                }];

    [alert addAction:[UIAlertAction actionWithTitle:@"Cancel"
                                              style:UIAlertActionStyleCancel
                                            handler:nil]];
    [alert addAction:loadAction];

    [self presentViewController:alert animated:YES completion:nil];
}

- (void)dismiss {
    [self dismissViewControllerAnimated:YES completion:nil];
}

void showSettingsSheet(void) {
    BunnySettingsViewController *settingsVC =
        [[BunnySettingsViewController alloc] initWithVersion:PACKAGE_VERSION];

    UINavigationController *navController =
        [[UINavigationController alloc] initWithRootViewController:settingsVC];
    navController.modalPresentationStyle = UIModalPresentationFormSheet;

    UIBarButtonItem *doneButton =
        [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemDone
                                                      target:settingsVC
                                                      action:@selector(dismiss)];
    settingsVC.navigationItem.rightBarButtonItem = doneButton;

    // Over whatever Discord shows; not twice
    UIViewController *top = topViewController();
    if ([top isKindOfClass:UINavigationController.class] &&
        [((UINavigationController *)top).viewControllers.firstObject isKindOfClass:BunnySettingsViewController.class]) {
        return;
    }
    [top presentViewController:navController animated:YES completion:nil];
}

@end
