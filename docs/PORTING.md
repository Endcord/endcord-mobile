# Porting Endcord PC plugins to Endcord mobile

Endcord mobile is built on Aliucord, a mod for the **legacy Android Discord app (version 126.21)**. That app
uses real Android views written in Java/Kotlin, not React. A plugin from Endcord PC (TypeScript patching
Discord's web bundle) therefore can't be translated line by line: it has to be re-implemented against the
Android app's classes. This guide explains how.

## Where things live

| What | Where |
| --- | --- |
| Built-in plugins | `Aliucord/src/main/java/com/endcord/plugins/<pluginname>/` (one package per plugin, lowercase) |
| Plugin registry | `Aliucord/src/main/java/com/endcord/plugins/registry/BatchNN.kt` |
| Base class | `com.aliucord.entities.EndcordPlugin` (`Aliucord/src/main/java/com/aliucord/entities/EndcordPlugin.kt`) |
| Settings schema | `com.aliucord.entities.PluginSetting` (same file) |
| Message long-press entries | `com.endcord.plugins.api.MessageActions` |
| Translations | `com.aliucord.i18n.I18n`, tables in `Aliucord/i18n/` |
| Conflicting plugin pairs | `com.endcord.plugins.PluginConflicts` |
| Reference ports | `silenttyping/SilentTyping.kt` (patch + setting), `textcommands/ReverseText.kt` (slash command) |
| Status of every PC plugin | `docs/plugins/*.md` |

## Anatomy of a port

```kotlin
internal class SilentTyping : EndcordPlugin(
    name = "SilentTyping",                  // exactly the PC plugin's name
    description = "Hide that you are typing", // exactly the PC plugin's English description
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("privacy", "chat")
    override val settingsSchema = listOf(
        PluginSetting.Switch("showInDms", "Still show typing in DMs", "Only hide your typing indicator in servers"),
    )

    override fun start(context: Context) {
        patcher.instead<StoreUserTyping>("setUserTyping", Long::class.javaPrimitiveType!!) { param ->
            if (bool("showInDms")) { /* ... */ }
            null
        }
    }
}
```

Then add `SilentTyping()` to your batch file in `registry/`.

* `name` must match the PC plugin's `name` so the shared description translations and conflict table apply.
* `description` must be the PC plugin's English `description`, unless the mobile behaviour differs; then
  describe what the mobile port does.
* Authors: map the PC plugin's `authors` through Endcord PC's `Devs` table. `Devs.Sharp` is `ewlle`,
  `Devs.Ven` and `Devs.Vendicated` are `rootpoi`; `ewlle`, `rootpoi`, `kraethis` and `vpg` are linked
  automatically. Any other name is listed as-is.
* Built-in plugins are **off by default**. Override `enabledByDefault` only for plugins that fix things.
* `restartRequired = true` if toggling only takes effect after a restart (for example a patch on something
  constructed once at startup).
* The default `stop()` removes every patch, slash command and `MessageActions` entry the plugin registered.
  If you add views, subscriptions, timers or listeners yourself, override `stop()`, clean them up and call
  `super.stop(context)`.

### Settings

Declare settings in `settingsSchema` and a settings page is generated automatically. Available entries:
`Switch`, `Text` (use `multiline = true` for lists), `Number` (with `min`/`max`), `Choice`, `Action`.
Read values with `bool(key)`, `string(key)`, `int(key)`, `choice(key)` and `list(key)` (comma or newline
separated text). Values are read on every call, so read them where you need them instead of caching them in
`start()`, and changes apply immediately. Override `onSettingChanged(key)` if a change has to be re-applied
(for example to refresh the chat); text fields report once the user stops typing.

### Text and translations

All user facing text is written in English and passed through `I18n.t("...")` (or the `tr("...")` shorthand)
at the moment it is shown. Placeholders use braces: `I18n.t("Deleted {count} messages", "count" to n)`.
Setting labels, descriptions and `MessageActions` labels are translated for you. Endcord PC's
translations are reused where the English text matches; new strings are added to `Aliucord/i18n/core/*.json`.
Never translate slash command *names*.

If a port's English `description` differs from Endcord PC's, add translations of the new description to your
batch's i18n file too: the exact English text is looked up before Endcord PC's translation of the plugin.

### Slash commands

```kotlin
commands.registerCommand("reverse", "Flips your message backwards", CommandsAPI.requiredMessageOption) { ctx ->
    CommandsAPI.CommandResult(ctx.getRequiredString("message").reversed(), null, /* send = */ true)
}
```

`CommandResult(content, embeds, send)`: `send = false` shows the result only to the user, as a Clyde message.
More options: `Utils.createCommandOption(...)`, see `coreplugins/CoreCommands.kt`.

### Message rows and outgoing messages

Many plugins change how a message row looks. Don't patch `WidgetChatListAdapterItemMessage` yourself: register a
`com.endcord.plugins.api.ChatDecorator` with `ChatHooks.register(...)`. One shared set of hooks then calls every
enabled decorator, so plugins never overwrite each other's author names, timestamps or text. Decorators can
transform the raw content before Discord parses it, decorate the rendered text, format the author name, the
timestamp and reply previews, and run after a row is configured. `api/Spans.kt` has span helpers.

Everything the user sends from the chat input goes through one ordered pipeline, `api.OutgoingMessages`. Hooks run
by `OutgoingMessages.Priority` (actions such as `s/a/b`, then replacements, expansions, sanitizing, styling,
appending, encryption and finally delivery). A hook can change `message.content`, `cancel()` the send or run code
`afterSend`. Slash commands and command output never go through it, and edits only reach hooks registered with
`onEdit = true`. For a plain text rewrite, `SendHooks.register(owner, onEdit, priority) { text -> ... }` is
enough. Never patch the send path yourself, or the order breaks (for example styling after encryption).

`EndcordPlugin.stop()` unregisters decorators, send hooks and message actions automatically.

### User and channel sheet entries

`api.UserSheetActions` adds entries to the user profile sheet and `api.ChannelSheetActions` to the channel/DM
long-press sheet, the same way `MessageActions` works for messages.

### Message long-press entries

```kotlin
MessageActions.register(name, "Copy Raw Content", R.e.ic_copy_24dp, visible = { it.message.content.isNotEmpty() }) {
    Utils.setClipboard("Message", it.message.content)
}
```

## Shared helpers from other batches

Before writing a hook, check whether one exists: `api/` (message rows, sending, message/user/channel sheets),
`guildscommon` (server list, channel and DM lists, server long-press menu), `notifycommon` (gateway events,
in-app/system notifications, app in background), `composercommon` (send button menu, chat input helpers),
`commandscommon` (late Clyde messages, regex helpers), `actionscommon` (file saving, list pages, stores).

## Finding the Android Discord classes

The app is obfuscated in places (classes like `b.a.a.c`, fields like `l`). The decompiled jar the core
compiles against is in the Gradle cache:

```sh
J=$(ls ~/.gradle/caches/9.1.0/transforms/*/workspace/transformed/jars/discord-126021.jar | head -1)
unzip -l "$J" | grep -i typing                         # find classes
javap -classpath "$J" -p com.discord.stores.StoreUserTyping   # exact method signatures
```

Useful entry points:

* `com.discord.stores.StoreStream` – every store: `getUsers()`, `getChannels()`, `getGuilds()`,
  `getMessages()`, `getUserSettings()`, `getVoiceStates()`, `getGatewaySocket()` ...
* `com.discord.widgets.chat.list.adapter.WidgetChatListAdapterItemMessage` – a rendered message
* `com.discord.widgets.chat.list.actions.WidgetChatListActions` – the message long-press sheet
* `com.discord.widgets.user.usersheet.WidgetUserSheet` – the user profile sheet
* `com.discord.widgets.chat.input.ChatInputViewModel` – sending messages
* `com.discord.utilities.rest.RestAPI` – REST calls, `com.aliucord.Http` for custom requests
* `com.lytefast.flexinput.R` – Discord's resources (`R.e` drawables, `R.b` attrs, `R.i` styles);
  `Utils.getResId("name", "id")` resolves ids by name
* The existing coreplugins in `Aliucord/src/main/java/com/aliucord/coreplugins/` show many of these in use.

Only patch methods you have **verified with `javap`**, with their exact parameter types. A patch on a method
that doesn't exist fails at runtime, not at compile time.

## Runtime constraints

* **Kotlin stdlib 1.5.21** is what runs on the device. Don't use newer stdlib APIs: no `entries` on enums
  (use `values()`), no `buildList`/`buildMap`, no `kotlin.time`, no coroutines. The compiler is newer, so newer
  *language* features are fine.
* **Discord's jar shadows parts of the Kotlin stdlib** (`Regex`, `MatchResult`, `IntRange`, `Pair`, `Sequence`...)
  with stripped copies at compile time: default arguments are missing and some constructors don't exist. Use
  `java.util.regex.Pattern` instead of `Regex`, and pass every argument explicitly.
* Java APIs: **Android API 24**. The core dex is *not* desugared, so `java.time` (API 26) crashes on Android 7.
  Use `java.util.Calendar`, `SimpleDateFormat` and `android.text.format.DateUtils`.
* `kotlin.Unit` is shadowed too: `Unit` can't be written as a value. Let lambdas end with a Unit expression or `{}`.
* Kotlin metadata of some Discord classes is stripped, so companion objects such as `WidgetUserSheet.Companion`
  aren't callable from Kotlin. A tiny Java helper class in your plugin package works.
* `patcher.before/after/instead` can't hook static methods (they cast `thisObject`). Use
  `patcher.patch(method, object : XC_MethodHook() { ... })` for those.
* RxJava **1.x** (`rx.Observable`), Gson (`GsonUtils`), OkHttp via Discord.
* No network or disk I/O on the main thread: use `Utils.threadPool.execute { }` and come back with
  `Utils.mainThread.post { }`.
* Hooks inside list rendering (message binds, channel list) run constantly. Cache reflection
  (`Field`/`Method` in `lazy` or companion vals), never allocate heavy objects per bind, and bail out early.
* Hooks must never take the chat down: catch exceptions in anything that runs while rendering and log them
  with `logger.error(...)`.

## Quality bar

A port ships only when it works the way its description says, on the real classes. If a feature cannot be
done on the legacy Android app, document it as not applicable instead of shipping something that pretends
to work. Partial ports are fine when the description says what the mobile version does.

## Building

```sh
export JAVA_HOME=~/dev-tools/jdk21 PATH=~/dev-tools/jdk21/bin:$PATH
./gradlew :Aliucord:compileDebugKotlin   # fast check
./gradlew :Aliucord:make                 # Aliucord/build/outputs/Aliucord.zip
```

`local.properties` must point to the Android SDK: `sdk.dir=C:/Users/<you>/dev-tools/android-sdk`.
