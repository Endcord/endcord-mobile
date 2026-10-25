<div align="center">
    <h1>Endcord for Android</h1>
    <p>Endcord on the <em>current</em> Discord Android app: plugins, themes and fonts, with an installer in five languages.</p>

[Endcord PC](https://github.com/rootpoii/endcord) · [Endcord for the classic Discord app](https://github.com/rootpoii/endcord-mobile) · [Discord](https://discord.gg/endcord)

</div>

> [!NOTE]
> This project is a **fork of [Revenge](https://github.com/revenge-mod)** (bundle, Xposed loader and manager), which
> itself continues Bunny and Vendetta. Endcord adds its own branding, five languages, an update channel on this
> repository's `builds` branch and, over time, the plugins of Endcord PC. See [UPSTREAM.md](UPSTREAM.md) for the
> exact upstream commits. It is not affiliated with Discord Inc. or the Revenge team.

## What is in this repository

| Directory | What it is | Upstream |
| --- | --- | --- |
| `bundle/` | The JavaScript bundle that runs inside Discord: plugin system, settings UI, themes, fonts. Built with Bun into `endcord.min.js`. | revenge-bundle (BSD-3) |
| `loader/` | The Xposed module that loads the bundle into Discord. Works both embedded by the installer (no root) and as a regular LSPosed module (root). | revenge-xposed (GPL-3) |
| `installer/` | Endcord Installer: downloads the latest Discord, embeds the loader with LSPatch, re-signs and installs it as a separate app. | revenge-manager (OSL-3) |

Builds are published by the [Build workflow](.github/workflows/build.yml) to the `builds` branch:
`endcord.min.js` (bundle), `endcord-xposed.apk` (loader) and `data.json` (what was built). The loader fetches the
bundle from there on every start (with ETag caching), and the installer checks that branch every 15 minutes.

## Installing

### Without root (everyone)

Android only lets an app be modified by whoever signed it, so Discord from the Play Store can't be changed in
place. Endcord Installer therefore downloads Discord itself and installs the patched copy **as a separate app
called Endcord**. Your normal Discord stays untouched; you can keep both.

1. Download the latest `endcord-installer-*.apk` from the [releases](../../releases/latest) and install it.
2. Open **Endcord Installer**, choose your language if it didn't pick the right one, and tap **Install**.
   It downloads Discord (stable channel by default), adds Endcord and installs it.
3. Open **Endcord** and sign in to Discord.

### With root (LSPosed): Endcord inside the real Discord

This is the "desktop-like" mode: nothing is reinstalled, the Play Store Discord runs Endcord.

1. Install [LSPosed](https://github.com/JingMatrix/LSPosed) (or another Xposed framework).
2. Download `endcord-xposed.apk` from the [`builds` branch](../../tree/builds) and install it.
3. In LSPosed, enable the **Endcord Xposed** module for **Discord** (`com.discord`).
4. Force-stop Discord and open it again.

## Updating

- **Endcord itself** (the bundle): updated automatically. The loader downloads the newest `endcord.min.js` when
  Discord starts, and Endcord's settings have a "Clear JS bundle" option if you ever need to force it.
- **Discord**: Endcord Installer checks for new Discord versions every 15 minutes (configurable) and shows a
  notification; tap it to update. Without root, Discord updates always go through the installer.
- **The installer**: it tells you when a new release is available.

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

### Releasing

- Every push to `main` rebuilds the bundle and the loader and publishes them to the `builds` branch. Add the
  `LOADER_KEYSTORE` (base64), `LOADER_KEYSTORE_PASSWORD`, `LOADER_KEY_ALIAS` and `LOADER_KEY_PASSWORD` secrets so
  the loader is release-signed; without them the debug-signed module is published.
- Installer releases: run **Release Installer** by hand with a version number. It needs `INSTALLER_KEYSTORE`
  (base64), `INSTALLER_KEYSTORE_PASSWORD`, `INSTALLER_KEY_ALIAS` and `INSTALLER_KEY_PASSWORD`.

### Plugins

The plugin system is Revenge's (Vendetta-compatible plugins written in TypeScript). The plan for bringing
Endcord PC's plugins over is in [docs/PLUGINS.md](docs/PLUGINS.md); the state of the project is in
[docs/STATUS.md](docs/STATUS.md).

## License and credits

Each directory keeps the license of the project it was forked from: `bundle/` BSD-3-Clause, `loader/` GPL-3.0,
`installer/` OSL-3.0. The original copyright notices of Team Vendetta, pylixonly and Team Revenge are kept in the
source files and shown in the installer's About screen.

Endcord for Android would not exist without [Revenge](https://github.com/revenge-mod), Bunny and Vendetta,
[LSPatch](https://github.com/LSPosed/LSPatch) and the Vendetta tracker mirrors that serve the Discord APKs.

This is a modification of the Discord app and is against Discord's Terms of Service. Use it at your own risk.
