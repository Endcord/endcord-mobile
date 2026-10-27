# Developing Endcord for Android

Endcord for Android is a fork of [Revenge](https://github.com/revenge-mod) and lives on the `next` branch of
`endcord-mobile`, next to the classic-app Endcord on `main`; the two are separate apps and separate code.
[UPSTREAM.md](../UPSTREAM.md) lists the exact upstream commits.

## What is in this repository

| Directory | What it is | Upstream |
| --- | --- | --- |
| `bundle/` | The JavaScript that runs inside Discord: Endcord's plugins (`src/plugins`), the plugin system, settings UI, themes, fonts and translations (`src/core/i18n`). Built with Bun into `endcord.min.js`. | revenge-bundle (BSD-3) |
| `loader/` | The Xposed module that loads the bundle into Discord. Works both embedded by the installer (no root) and as a regular LSPosed module (root). | revenge-xposed (GPL-3) |
| `installer/` | Endcord Installer: takes the installed or the latest Discord, embeds the loader with LSPatch, re-signs and installs it as a separate app. | revenge-manager (OSL-3) |

Every push to `next` is built by the [Build workflow](../.github/workflows/build.yml) and published to the
`builds-next` branch: `endcord.min.js` (bundle), `endcord.v*.hbc` (the bundle as Hermes bytecode), `endcord-xposed.apk`
(loader), `endcord-installer.apk` (installer build) and `data.json` (what was built).

## Building

Requirements: [Bun](https://bun.sh) for the bundle, JDK 25 for the loader, JDK 17+ for the installer, Android SDK.

```sh
# Bundle → bundle/dist/endcord.min.js
cd bundle && bun install && bun run build --build-minify

# Loader → loader/app/build/outputs/apk/debug/app-debug.apk
# -Pendcord.bundleUrl points the debug build at a bundle you serve yourself (bun run serve in bundle/ serves
# it on port 4040; from the Android emulator the host is 10.0.2.2)
cd loader && ./gradlew :app:assembleDebug -Pendcord.bundleUrl=http://10.0.2.2:4040/endcord.min.js

# Installer → installer/app/build/outputs/apk/debug/endcord-installer-*.apk
cd installer && ./gradlew :app:assembleDebug
```

Package names: the installer is `com.endcord.installer.next`, the patched Discord is `com.endcord.next` (the
classic-app Endcord uses `com.endcord`, so both can be installed at once), the loader module is `com.endcord.xposed`.

## Plugins

Endcord's plugins live one per folder, like Endcord PC's: `bundle/src/plugins/<pluginName>/index.ts(x)`, with what
several plugins share in `bundle/src/plugins/shared/`. Each is defined with `definePlugin` from
`bundle/src/plugins/api.ts`: a settings schema (the settings page is generated from it), `start` with a `cleanup`
helper for every patch, and an optional extra settings component. Plugins find Discord's modules by their source path
(`moduleAt("modules/...")`), which survives the renames that break name lookups, and must tolerate a module being
missing: a plugin that throws while starting is turned off with a notice, never crashing Discord. Most plugins use the
shared hooks in `bundle/src/plugins/hooks.tsx` (`onSend`, `onIncomingMessage`, `onMessageRow`, `addMessageAction`,
`command`), each patched into Discord once. The build generates `bundle/src/plugins/manifest.ts` from the plugin
folders, so Endcord starts knowing every plugin's name and description but loads a plugin's code only when it is
turned on. The full list and how to write one are in [PLUGINS.md](PLUGINS.md).

## Translations

User-visible text is English in the code, passed through `t()` (or marked with `tx()`). `bun run i18n` (or
`node scripts/i18n-sync.mjs --pc <path to Endcord PC>`) builds `src/core/i18n/locales/*.json` from Endcord PC's
translations, with mobile-specific wording in `src/core/i18n/overrides.json`. CI fails if a string is untranslated.

## Testing

The [Emulator test workflow](../.github/workflows/emulator.yml) runs on every push to a `ci/**` branch: it installs
Endcord Installer on an Android emulator, installs Endcord both by downloading Discord and from a pre-installed
Discord (tapping through the installer like a user), launches Endcord and runs the bundle's self-test (built with
`--test`) inside Discord. Screenshots, logs and the self-test report are pushed to the `test-results/<branch>` branch.
The same push runs the Build workflow too, which builds everything a release does without publishing it.

## Releasing

- Every push to `next` rebuilds the bundle, the loader and the installer and publishes them to `builds-next`; running
  the Build workflow by hand on `next` does the same without a new commit. The loader is release-signed with the
  `LOADER_KEYSTORE` (base64), `LOADER_KEYSTORE_PASSWORD`, `LOADER_KEY_ALIAS` and `LOADER_KEY_PASSWORD` secrets;
  without them the debug-signed module is published.
- Installer releases: run **Release Installer** by hand with a version number, or push a `next-installer-v<version>`
  tag (`git tag next-installer-v1.0.1 && git push origin next-installer-v1.0.1`). It needs `INSTALLER_KEYSTORE`
  (base64), `INSTALLER_KEYSTORE_PASSWORD`, `INSTALLER_KEY_ALIAS` and `INSTALLER_KEY_PASSWORD`; with them, every push
  to `next` signs its installer the same way, so one can update the other. The Endcord Classic installer is signed
  with the same key, both in `builds-next` and in `main`'s own releases. The README's download links name the
  version, so update them with each release.
- Without the secrets, every build is signed with a new throwaway key, and Android won't install one over another.
  Make each keystore once, keep it and its passwords somewhere safe (a lost key means everyone reinstalls), and add
  it under the repository's *Settings → Secrets and variables → Actions*:

  ```sh
  keytool -genkeypair -keystore installer.jks -alias installer -keyalg RSA -keysize 4096 -validity 36500
  base64 -w0 installer.jks    # the INSTALLER_KEYSTORE secret
  ```

  keytool asks for one password, which is both `INSTALLER_KEYSTORE_PASSWORD` and `INSTALLER_KEY_PASSWORD`; the alias
  (`installer`) is `INSTALLER_KEY_ALIAS`. The same with `loader.jks` for the `LOADER_*` secrets.
