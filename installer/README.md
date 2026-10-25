# Endcord Installer

Installs and updates [Endcord for Android](../README.md). It downloads the classic Discord app, patches it
with Endcord's injector and smali patches, signs it and installs it, in English, Türkçe, Русский, Español and
Français.

Endcord Installer is a fork of [Aliucord Manager](https://github.com/Aliucord/Manager) by the Aliucord
contributors, licensed under the Open Software License 3.0.

## Building

Requirements: JDK 21 and the Android SDK. Create `installer/local.properties` with `sdk.dir=/path/to/android-sdk`.

```sh
./gradlew :app:assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/`. Release builds are made by the *Build Installer*
GitHub workflow, see the main README.

Endcord's builds are downloaded from the repository set in the root `gradle.properties` (`endcord.repository`);
the base Discord APK and the Aliuhook library come from the Aliucord maven.
