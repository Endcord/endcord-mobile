# Endcord for iOS

The tweak that loads Endcord into Discord on iPhone and iPad: the same bundle as on Android
(`../bundle`), which it downloads from the `builds-next` branch. It needs Discord 332 or newer, where React Native
runs bridgeless; the tweak starts the bundle from `RCTHost`'s `instance:didInitializeRuntime:` through JSI.

Based on [RainTweak](https://codeberg.org/raincord/RainTweak) (OSL-3.0); see `../UPSTREAM.md`.

## Builds

The iOS workflow (`.github/workflows/ios.yml`) builds it on macOS with [Theos](https://theos.dev):

- `com.endcord.tweak_<version>_iphoneos-arm64.deb` for jailbroken devices (rootless)
- `Endcord.dylib` to inject into a Discord IPA with Feather, ESign, KSign or Sideloadly
- `Endcord.ipa`, Discord with the tweak injected, from the decrypted Discord IPA linked in the `DISCORD_IPA_URL`
  secret

On `next` they're published as the `ios-v<version>` release, whose files each new Discord replaces, and
`builds-ios/apps.json` is the source AltStore and SideStore install and update Endcord from:
`https://raw.githubusercontent.com/Endcord/endcord-mobile/builds-ios/apps.json`. For a new Discord, change the secret
and re-run the latest iOS run on `next`.

Shake the device for the recovery menu (safe mode, a custom bundle URL, deleting plugins or themes). Endcord's files
are in the Files app too with `Endcord.ipa` (On My iPhone → Endcord: `pyoncord`, and its settings in `vd_mmkv`).

## Tests

The workflow's simulator job (`Tests/run.sh`) builds the tweak for the iOS simulator and loads it into `Tests/Host.mm`,
a stand-in for Discord with the Hermes runtime Discord ships (bytecode 98 and 99), which downloads its bundle from
`Tests/server.py`. Each scenario is one launch: the first start, the cache and its ETag, updates, the plain bundle
when there's no bytecode one, bytecode for another Hermes, offline starts, custom URLs, broken files, themes, fonts,
a bundle that throws, the published bundle, the recovery menu and safe mode. The release is only published when it
passes.

## What sideloading can't do

These hold for every modded Discord installed with a sideloading app:

- Notifications don't arrive while Discord is closed or in the background
- Passkeys and sharing to Discord from other apps don't work
- Changing the app icon only works when the bundle ID matches the provisioning profile's App ID
