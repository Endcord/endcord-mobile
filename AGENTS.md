# Guidelines for contributors and coding agents

Endcord for Android is a fork of [Aliucord](https://github.com/Aliucord/Aliucord) that runs on the legacy Discord
app (126.21). Contributions are welcome, written by hand or with help from tools, as long as they meet the bar
below. You are responsible for every line you submit: read it, build it and test it.

## Before you change anything

- Read [`docs/PORTING.md`](docs/PORTING.md). It explains the plugin framework, the shared hooks in
  `com.endcord.plugins.api` and the runtime pitfalls of this app.
- Check every class, method and field you hook against the real Discord 126.21 classes (`javap` on the
  `discord-126021.jar` in the Gradle cache). Names you remember from newer Discord versions do not exist here.

## Runtime rules that break builds on real phones

- Kotlin stdlib **1.5.21** runs on the device: no newer stdlib APIs.
- Discord's jar shadows `kotlin.text.Regex`, `kotlin.Pair` and `kotlin.Unit` with stripped copies. Prefer
  `java.util.regex.Pattern`.
- Android **API 24** and no desugaring: no `java.time`.
- `patcher.before/after/instead` cannot hook static methods; use `patcher.patch(method, XC_MethodHook)`.
- Never do network or disk I/O on the main thread, and catch exceptions in anything that runs while rendering.

## Before you open a pull request

```sh
./gradlew :Endcord:make
node scripts/i18n-sync.js
python scripts/check-runtime-refs.py Endcord/build/outputs/Endcord.zip <see docs/PORTING.md for the jars>
```

- Keep Java packages as `com.aliucord.*`: existing Aliucord plugins depend on them. Everything users see says
  Endcord.
- New user-visible text goes through `I18n` and gets translations in `Endcord/i18n/`.
- Test on a device or emulator, and describe what you tested in the pull request.
- Keep the license headers and the copyright notices of the original Aliucord authors.
