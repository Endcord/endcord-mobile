we're still working on it so don't use it ok?

<div align="center">
    <img src=".github/assets/endcord-banner.png" alt="Endcord" width="500" />
    <h1>Endcord for Android</h1>
    <p>Endcord's plugins, languages and updates on your phone, built on the classic Discord app.</p>

[![Build](https://github.com/rootpoii/endcord-mobile/actions/workflows/build.yml/badge.svg)](https://github.com/rootpoii/endcord-mobile/actions/workflows/build.yml)
[![License: OSL-3.0](https://img.shields.io/badge/license-OSL--3.0-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/rootpoii/endcord-mobile?label=installer)](https://github.com/rootpoii/endcord-mobile/releases/latest)

[Website](https://endcord.com) · [Discord](https://discord.gg/endcord) · [Endcord PC](https://github.com/rootpoii/endcord)

</div>

> [!NOTE]
> Endcord for Android is a **fork of [Aliucord](https://github.com/Aliucord/Aliucord)**, the Android Discord client
> mod. It keeps Aliucord's core and plugin compatibility, and adds Endcord PC's plugins, languages, updater and
> installer on top. It is not affiliated with the Aliucord team or with Discord.
>
> Looking for Endcord on the **current** Discord app? That is a separate client on the
> [`next` branch](../../tree/next) of this repository (a fork of Revenge), with its own README. This branch is the
> classic-app client.

## Features

- **Built-in plugins from Endcord PC**, rewritten for Android. They are all off until you turn them on, and every
  one of them has a translated settings page. See [`docs/plugins`](docs/plugins) for what each one does on mobile.
- **Five languages**: English, Türkçe, Русский, Español and Français, with the same translations as Endcord PC.
  Picking a language also switches Discord itself.
- **Updates every 15 minutes**: Endcord checks this repository for a new build while it runs and shows an
  "Endcord updated" notification that updates with a single tap (or silently, if you turn on automatic updates).
- **Plugin manager** with total/enabled counters, filters, search, conflict warnings and "new" badges for
  plugins that arrived with an update.
- **Endcord Installer**: installs and updates Endcord in a few taps, in the same five languages.
- Compatible with Aliucord plugins, so the existing plugin ecosystem keeps working.
- Rootless. Blocks most of Discord's tracking and analytics.

### Supported devices

- Android 7 (SDK 24) to Android 16 (SDK 36)
- arm64, armeabi-v7a, x86_64, x86

## Installation

1. Download the latest `endcord-installer-*.apk` from the [releases](../../releases/latest) and install it.
   If you haven't allowed your browser to install apps, Android will ask you to.
2. Open **Endcord Installer**, pick your language and grant the permissions it asks for.
3. Tap **New Install** (or **Update**), choose your options and tap **Install**. Keep the installer open
   until it finishes. If it fails, check your connection, make sure you have at least 500MB free, and retry.
4. Tap **Launch**, grant Endcord access to its folder, and sign in to Discord. If signing in with a password
   fails with "A forbidden network request has occurred", Discord is blocking password logins from this app
   version with a captcha (Aliucord has the same issue); use **Login using token** instead (your token is the
   `authorization` header of any request in your browser's developer tools on discord.com; never share it).
5. Open **Settings → Endcord → Plugins** to turn on the plugins you want.

Keep Endcord Installer installed: it is needed for updates that change the base app.

This is a modification of the Discord app and is against Discord's Terms of Service. Use it at your own risk.

## Troubleshooting

- Restart Endcord (Settings → the restart button in the toolbar).
- If Endcord crashes on start, turn on safe mode from Endcord Installer → Plugins, or delete the plugin that
  causes it from the `Endcord/plugins` folder. Crash logs are in `Endcord/crashlogs`.
- Clear Endcord's cache in the system app settings, or reinstall it with Endcord Installer.
- Still stuck? Ask in the [Endcord Discord server](https://discord.gg/endcord).

## Development

| Path | What it is |
| --- | --- |
| `Endcord/` | The core (Kotlin/Java). Plugins built into Endcord live in `src/main/java/com/endcord/plugins`. |
| `Endcord/i18n/` | Translation tables, compiled into the core at build time. |
| `Injector/` | Loaded by the patched app; downloads and starts the core. |
| `patches/` | Smali patches applied to the Discord APK at install time. |
| `installer/` | Endcord Installer (Jetpack Compose), a separate Gradle build. |
| `docs/PORTING.md` | How to port an Endcord PC plugin to mobile. |
| `scripts/i18n-sync.js` | Collects strings used in the code and fills translations from Endcord PC. |

Requirements: JDK 21 and the Android SDK (platform 36). Create a `local.properties` with
`sdk.dir=/path/to/android-sdk` in the repository root (and in `installer/`).

```sh
./gradlew :Endcord:make           # core: Endcord/build/outputs/Endcord.zip
./gradlew :Injector:make          # injector
cd installer && ./gradlew :app:assembleDebug   # installer APK
node scripts/i18n-sync.js         # check translations
```

The GitHub repository that hosts the builds is set once in `gradle.properties` (`endcord.repository`).

### Releasing

- **Core update**: bump `endcord.version` in `gradle.properties` (and optionally write release notes in
  `.assets/changelog.md`), then push to `main`. The Build workflow publishes the new files to the `builds`
  branch, and every running Endcord picks the update up within 15 minutes.
- **Installer release**: run the *Build Installer* workflow manually with a version number. It needs the
  signing secrets `SIGNING_STORE_BASE64`, `SIGNING_STORE_PASSWORD`, `SIGNING_KEY_ALIAS` and
  `SIGNING_KEY_PASSWORD`.

## Contributing

Bug reports, translations and plugin ports are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md),
[AGENTS.md](AGENTS.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) first. Security issues go through
[SECURITY.md](SECURITY.md).

## Credits

Endcord for Android is based on [Aliucord](https://github.com/Aliucord/Aliucord) and
[Aliucord Manager](https://github.com/Aliucord/Manager) by Juby210, Vendicated, rushiiMachine and their
contributors, licensed under the Open Software License 3.0. Built-in plugins are ports of
[Endcord PC](https://github.com/rootpoii/endcord) plugins.

- [LSPlant](https://github.com/LSPosed/LSPlant) - A hook framework for Android Runtime (ART)
- [Pine](https://github.com/canyie/pine) - Dynamic java method hook framework on ART
- [apktool](https://apktool.org/), [jadx](https://github.com/skylot/jadx), [dex2jar](https://github.com/pxb1988/dex2jar)
- [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) (SIL Open Font License) for the installer's wordmark

## License

Endcord for Android is licensed under the [Open Software License 3.0](LICENSE), like Aliucord. The original
Aliucord copyright notices are kept in the source files.

Endcord is not affiliated with, endorsed by or connected to Discord Inc. or the Aliucord project.
