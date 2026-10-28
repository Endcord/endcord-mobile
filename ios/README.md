# Endcord for iOS

The tweak that loads Endcord into Discord on iPhone and iPad: the same bundle as on Android
(`../bundle`), which it downloads from the `builds-next` branch. It needs Discord 332 or newer, where React Native
runs bridgeless; the tweak starts the bundle from `RCTHost`'s `instance:didInitializeRuntime:` through JSI.

Based on [RainTweak](https://codeberg.org/raincord/RainTweak) (OSL-3.0); see `../UPSTREAM.md`.

## Builds

The iOS workflow builds it on macOS with [Theos](https://theos.dev):

- `Endcord_<version>_iphoneos-arm64.deb` for jailbroken devices (rootless)
- `Endcord.dylib` to inject into a Discord IPA with Feather, ESign, KSign or Sideloadly
- `Endcord.ipa`, Discord with the tweak injected, when the workflow is given a decrypted Discord IPA

Shake the device for the recovery menu (safe mode, a custom bundle URL, deleting plugins or themes).

## What sideloading can't do

These hold for every modded Discord installed with a sideloading app:

- Notifications don't arrive while Discord is closed or in the background
- Passkeys and sharing to Discord from other apps don't work
- Changing the app icon only works when the bundle ID matches the provisioning profile's App ID
