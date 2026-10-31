# Endcord for Android

The Android side of Endcord. It runs the same JavaScript bundle as iOS (`../bundle`).

| Directory | What it is | Upstream |
| --- | --- | --- |
| `loader/` | The Xposed module that loads the bundle into Discord, embedded by the installer or through LSPosed | [revenge-xposed](https://github.com/revenge-mod/revenge-xposed) (GPL-3.0) |
| `installer/` | Endcord Installer: embeds the loader into Discord with LSPatch and installs it next to your Discord | [revenge-manager](https://github.com/revenge-mod/revenge-manager) (OSL-3.0) |

```sh
# The loader needs JDK 25, the installer JDK 17 or newer, and both the Android SDK
cd android/loader && ./gradlew :app:assembleDebug
cd android/installer && ./gradlew :app:assembleDebug
```

Everything about installing Endcord is in the [main README](../README.md), and building, testing and releasing are in
[docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md).
