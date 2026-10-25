# Contributing to Endcord for Android

Thanks for helping! Bug reports, translations, plugin ports and fixes are all welcome.

## Reporting bugs

Open an issue with the **Bug/Crash Report** template. Include your Android version, the Endcord version
(Settings → Endcord), the plugins you have turned on, and the crash log from `Endcord/crashlogs` if there is
one. Problems with third-party plugins belong in that plugin's repository.

## Translations

Endcord ships in English, Türkçe, Русский, Español and Français. The tables live in `Endcord/i18n/`
(`core/<lang>.json` for the app, `plugins/` and `batches/` for plugin texts). After editing them run
`node scripts/i18n-sync.js`: it lists missing strings for every language.

## Code

1. Read [AGENTS.md](AGENTS.md) and [docs/PORTING.md](docs/PORTING.md).
2. Fork the repository and create a branch from `main`.
3. Build with JDK 21 and the Android SDK (see the README), and test on a phone or emulator.
4. Open a pull request that says what you changed and how you tested it.

Porting a plugin from Endcord PC? Update its row in `docs/plugins/` and run `node scripts/plugin-status.js`.

By contributing you agree that your contributions are licensed under the
[Open Software License 3.0](LICENSE), and you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
