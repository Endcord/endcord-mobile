<div align="center">
    <h1>Endcord for Android</h1>
    <p>Endcord on the <em>current</em> Discord Android app: 302 plugins (260 of them from Endcord PC), themes and fonts, in five languages.</p>

[Endcord PC](https://github.com/rootpoii/endcord) · [Endcord for the classic Discord app](https://github.com/rootpoii/endcord-mobile) (the `main` branch of this repository) · [Discord](https://discord.gg/endcord)

</div>

> [!NOTE]
> This project is a **fork of [Revenge](https://github.com/revenge-mod)** (bundle, Xposed loader and manager), which
> itself continues Bunny and Vendetta. Endcord adds its own plugins, five languages and an update channel on this
> repository. See [UPSTREAM.md](UPSTREAM.md) for the exact upstream commits. It lives on the `next` branch of the
> `endcord-mobile` repository, next to the classic-app Endcord on `main`; the two are separate apps and separate code.
> It is not affiliated with Discord Inc. or the Revenge team.

## Features

- **302 plugins built in, 260 of them from Endcord PC.** All off until you turn them on, each with its own settings page, in
  Endcord → Plugins, which shows how many there are and how many are on, with filters by status and tag, like Endcord
  PC's plugin manager. Endcord PC's popular plugins are listed first:

  | Plugin | On your phone |
  | --- | --- |
  | CustomProfile | Your own avatar, banner, display name, bio and pronouns, only visible to you |
  | MessageLogger | Deleted messages stay in red with a "deleted" tag, earlier versions of edited ones show above them, ghost ping alerts |
  | HideEndcord | Hides Endcord's settings for screenshots and screen sharing; `/hideendcord` brings them back |
  | FakeNitro | Emojis and stickers you can't use are sent as links |
  | SmoothType | Caret and selection colors for text boxes |
  | ViewIcons | Tap avatars, banners and server icons to see them full size |
  | ThemeLibrary | Browse and install community themes and Catppuccin without leaving the app |
  | oneko | The cat, running to wherever you touch |
  | PlatformIndicators | Desktop, web and mobile icons next to the time of messages |
  | RelationshipNotifier | Tells you when a friend, group chat or server removes you, including while you were offline |
  | SilentTyping | Your typing indicator is never sent, with an optional chat bar button |
  | FakeMute | Appear muted or deafened while your microphone and sound keep working |

  The other 290 cover slash commands (`/bold`, `/ship`, `/calc`, `/remindme`, `/translate`…), changing messages
  as you send them (TextReplace, Signature, silent messages, @someone…), filtering what reaches you (ClientSideBlock,
  BlockKeywords, ReplyPingControl…), rows in the message long-press menu (Bookmarks, Translate, ViewRaw, Copy Media
  Link, Reverse Image Search…), how messages are drawn (timestamps, pronouns, roles, colors), rich presence, voice,
  profiles, calls, pinning and hiding DMs and servers, statuses that follow your games and calls, viewing documents and
  ZIPs without downloading them, and 38 lookup and fun commands (`/weather`, `/define`, `/currency`, `/earthquakes`,
  `/trivia`…). The full list, with what each one does on a phone, is in [docs/PLUGINS.md](docs/PLUGINS.md).

- **Light on older phones.** Endcord starts with only a list of its plugins: a plugin's code is loaded the first time
  you turn it on, translations load for your language only, and developer tools load only when you connect them.
  About 140 KB of Endcord's code runs when Discord starts, however many plugins it has. The StartupTimings plugin
  shows how long Endcord and each plugin took to start.

- **Aliucord plugins need Endcord Classic.** They're written for the older Discord that Aliucord is built on and can't
  run on the current one. [Endcord Classic](https://github.com/rootpoii/endcord-mobile/tree/main) runs both Endcord's
  and Aliucord's plugins; the Plugins page says so and links it.

- **Five languages** everywhere: English, Türkçe, Русский, Español and Français, with Endcord PC's translations.
  Endcord follows Discord's language, or the one you pick in Endcord → General.
- **Built from the Discord you already have.** The installer uses the Discord installed on your phone (from the Play
  Store), or downloads the latest one if you prefer or don't have it.
- **Updates without reinstalling.** Endcord itself updates every time the app starts; when Discord updates, the
  installer tells you and rebuilds Endcord from the new version.
- Compatible with Vendetta and Revenge plugins and themes.

## Installing

### Without root (everyone)

Android only lets the app that signed Discord change it, so nobody but Discord can modify the installed Discord app
in place. Endcord Installer therefore copies Discord, adds Endcord to the copy and installs it **as a separate app
called Endcord**. Your Discord stays installed and untouched; you can keep both.

1. Download the latest `next-installer-v*` release's APK from the [releases](../../releases) and install it.
2. Open **Endcord Installer**. If Discord is on your phone, **Use the Discord on this phone** is selected; otherwise
   (or if you choose **Download Discord**) the latest Discord is downloaded.
3. Tap **Install** and confirm Android's prompt.
4. Open **Endcord** and sign in to Discord. Endcord's settings are in Discord's settings, in the **Endcord** section.

### With root (LSPosed): Endcord inside the real Discord

This is the desktop-like mode: nothing is reinstalled, the Play Store Discord runs Endcord.

1. Install [LSPosed](https://github.com/JingMatrix/LSPosed) (or another Xposed framework).
2. Download `endcord-xposed.apk` from the [`builds-next` branch](../../tree/builds-next) and install it.
3. In LSPosed, enable the **Endcord Xposed** module for **Discord** (`com.discord`).
4. Force-stop Discord and open it again.

## Updating

- **Endcord itself** (the bundle) updates automatically: the loader downloads the newest `endcord.min.js` when Discord
  starts. If the download fails (offline, say), the copy from last time is used.
- **Discord**: when Discord on your phone updates, or a new Discord is released if you chose to download it, Endcord
  Installer shows a notification (checked every 15 minutes by default); tap it to rebuild Endcord.
- **The installer** tells you when a new release is available.

## Troubleshooting

- Shake the phone, or hold two fingers on the screen for 3 seconds right after Endcord opens, for the recovery menu: reload, recovery mode (plugins and themes
  off), delete the downloaded Endcord, reset the loader settings.
- A plugin that fails to start turns itself off and says so; turn it back on after updating.
- Endcord → General → **Safe Mode** reloads without plugins and themes.

## What is in this repository

| Directory | What it is | Upstream |
| --- | --- | --- |
| `bundle/` | The JavaScript that runs inside Discord: Endcord's plugins (`src/plugins`), the plugin system, settings UI, themes, fonts and translations (`src/core/i18n`). Built with Bun into `endcord.min.js`. | revenge-bundle (BSD-3) |
| `loader/` | The Xposed module that loads the bundle into Discord. Works both embedded by the installer (no root) and as a regular LSPosed module (root). | revenge-xposed (GPL-3) |
| `installer/` | Endcord Installer: takes the installed or the latest Discord, embeds the loader with LSPatch, re-signs and installs it as a separate app. | revenge-manager (OSL-3) |

Every push to `next` is built by the [Build workflow](.github/workflows/build.yml) and published to the
`builds-next` branch: `endcord.min.js` (bundle), `endcord-xposed.apk` (loader), `endcord-installer.apk` (installer
build) and `data.json` (what was built).

## Development

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

### Plugins

Endcord's plugins live one per folder, like Endcord PC's: `bundle/src/plugins/<pluginName>/index.ts(x)`, with what
several plugins share in `bundle/src/plugins/shared/`. Each is defined with `definePlugin` from
`bundle/src/plugins/api.ts`: a settings schema (the settings page is generated from it), `start` with a `cleanup`
helper for every patch, and an optional extra settings component. Plugins find Discord's modules by their source path
(`moduleAt("modules/...")`), which survives the renames that break name lookups, and must tolerate a module being
missing: a plugin that throws while starting is turned off with a notice, never crashing Discord. Most plugins use the
shared hooks in `bundle/src/plugins/hooks.tsx` (`onSend`, `onIncomingMessage`, `onMessageRow`, `addMessageAction`,
`command`), each patched into Discord once. The build generates `bundle/src/plugins/manifest.ts` from the plugin
folders, so Endcord starts knowing every plugin's name and description but loads a plugin's code only when it is
turned on. The full list and how to write one are in [docs/PLUGINS.md](docs/PLUGINS.md).

### Translations

User-visible text is English in the code, passed through `t()` (or marked with `tx()`). `bun run i18n` (or
`node scripts/i18n-sync.mjs --pc <path to Endcord PC>`) builds `src/core/i18n/locales/*.json` from Endcord PC's
translations, with mobile-specific wording in `src/core/i18n/overrides.json`. CI fails if a string is untranslated.

### Testing

The [Emulator test workflow](.github/workflows/emulator.yml) runs on every push to a `ci/**` branch: it installs
Endcord Installer on an Android emulator, installs Endcord both by downloading Discord and from a pre-installed
Discord (tapping through the installer like a user), launches Endcord and runs the bundle's self-test (built with
`--test`) inside Discord. Screenshots, logs and the self-test report are pushed to the `test-results/<branch>` branch.
The same push runs the Build workflow too, which builds everything a release does without publishing it.

### Releasing

- Every push to `next` rebuilds the bundle, the loader and the installer and publishes them to `builds-next`. Add the
  `LOADER_KEYSTORE` (base64), `LOADER_KEYSTORE_PASSWORD`, `LOADER_KEY_ALIAS` and `LOADER_KEY_PASSWORD` secrets so the
  loader is release-signed; without them the debug-signed module is published.
- Installer releases: run **Release Installer** by hand with a version number. It needs `INSTALLER_KEYSTORE`
  (base64), `INSTALLER_KEYSTORE_PASSWORD`, `INSTALLER_KEY_ALIAS` and `INSTALLER_KEY_PASSWORD`; with them, every push
  to `next` signs its installer the same way, so one can update the other.
- Without the secrets, every build is signed with a new throwaway key, and Android won't install one over another.
  Make each keystore once, keep it and its passwords somewhere safe (a lost key means everyone reinstalls), and add
  it under the repository's *Settings → Secrets and variables → Actions*:

  ```sh
  keytool -genkeypair -keystore installer.jks -alias installer -keyalg RSA -keysize 4096 -validity 36500
  base64 -w0 installer.jks    # the INSTALLER_KEYSTORE secret
  ```

  keytool asks for one password, which is both `INSTALLER_KEYSTORE_PASSWORD` and `INSTALLER_KEY_PASSWORD`; the alias
  (`installer`) is `INSTALLER_KEY_ALIAS`. The same with `loader.jks` for the `LOADER_*` secrets.

## License and credits

Endcord for Android is © 2026 rootpoi and contributors. Each directory keeps the license of the project it was forked
from: `bundle/` BSD-3-Clause, `loader/` GPL-3.0, `installer/` OSL-3.0. Endcord's plugins (`bundle/src/plugins`) and the other files marked
`SPDX-License-Identifier: GPL-3.0-or-later` are GPL-3.0-or-later, like Endcord PC, so the built bundle as a whole is
distributed under the GPL-3.0. The original copyright notices of Team Vendetta, pylixonly and Team Revenge are kept in
the source files and shown in the installer's About screen.

Endcord for Android would not exist without [Revenge](https://github.com/revenge-mod), Bunny and Vendetta,
[LSPatch](https://github.com/LSPosed/LSPatch) and the Vendetta tracker mirrors that serve the Discord APKs. MessageLogger
and FakeNitro follow the approaches of the [Revenge community plugins](https://github.com/revenge-mod/revenge-community-plugins)
(GPL-3.0); oneko's cat is [oneko.js](https://github.com/adryd325/oneko.js) by adryd; ThemeLibrary lists
[Catppuccin](https://github.com/catppuccin/vendetta) and the community [theme marketplace](https://github.com/kmmiio99o/theme-marketplace).

This is a modification of the Discord app and is against Discord's Terms of Service. Use it at your own risk.
