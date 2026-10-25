# Batch 03: composer

Plugins that change or act on the message you are about to send. They share two pieces in
`com.endcord.plugins.composercommon`:

* **One pre-send hook** (`OutgoingMessages`) on `ChatInputViewModel.sendMessage`, the path of every message sent or
  edited from the chat input (including thread starters and forum posts). Plugins register an ordered handler that can
  rewrite the text or cancel the send. Only text the user typed goes through it: slash commands, Aliucord command
  output and Discord's built-in commands (`/shrug`, `/me`, ...) are sent untouched. Edits only reach handlers that ask
  for them, as on PC where edits have their own listener: ClearURLs and ZeroWidthSanitizer. Fixed order: `s///` and
  `+emoji` actions, TextReplace, SendTimestamps, ClearURLs, ZeroWidthSanitizer, PolishWording, WriteUpperCase,
  ChatGPTWriting, AutoVaporwave, TalkInReverse, Signature, EncryptedMessage, then ScheduledMessages, MessageBurst,
  SilentMessageToggle and SplitLargeMessages.
* **The send button's long-press menu** (`ComposerMenu`), which replaces PC's chat bar buttons: toggles such as
  "Reverse messages" or "Send silently" and tools such as "Insert Timestamp". Long-pressing the send button only shows
  Discord's tooltip while none of these plugins is on.

The first message of a new thread or forum post is only rewritten: the plugins that send, edit or hold back messages
themselves (SedEnhanced, BetterPlusReacts, MessageBurst, ScheduledMessages, SilentMessageToggle, SplitLargeMessages)
leave it alone. Messages sent from notification quick replies or the share sheet don't go through the chat input, so
the plugins don't see them.

| Plugin | Status | Notes |
| --- | --- | --- |
| TalkInReverse | Ported | "Reverse messages" toggle in the send button's long-press menu instead of a chat bar button; like PC it starts off on every launch. Reverses by code point, so emoji survive (PC splits them). |
| AutoVaporwave | Ported | Same fullwidth mapping as PC. |
| WriteUpperCase | Ported | Same sentence splitting and "Strings not to capitalise" setting (split on commas, trimmed). |
| Signature | Ported | Same name, header and on/off settings. Toggled from the long-press menu ("Enable Signature"), the settings page or `/signature [value]`, which replaces PC's chat bar icon and text box context menu, so the `showIcon` and `contextMenu` settings are gone. The signature is added before EncryptedMessage runs, so it is encrypted with the message. |
| TextReplace | Partial | Rules are lines in two text settings instead of PC's rule cards: `find => replace`, optionally `find => replace => only if includes`, `\n` for a new line; regex rules as `/pattern/flags => replace` with JavaScript replacement syntax (`$1`, `$&`). A "Rule Tester" dialog replaces the inline tester. Same behaviour as PC otherwise, including skipping the rule sharing channel. Rules made on PC aren't imported. |
| ClearURLs | Ported | Downloads the same ClearURLs rules, caches them on the device and refreshes them once a day. Runs on sends and edits like PC. Parameter rules have to match the whole parameter name, as in the ClearURLs extension (PC also strips parameters that merely contain a rule, which can break links). |
| ZeroWidthSanitizer | Ported | Same characters and settings; the toast replaces PC's notification and verbose logs go to the debug log. Runs before EncryptedMessage, so its marker isn't removed. |
| SplitLargeMessages | Ported | Splits at 2000 characters (4000 with Nitro) with PC's three modes. The first part keeps the attachments and the reply; the rest are queued with the configured delay, which is in whole seconds (1 to 10, PC allows half seconds). Same slowmode rules: in slowmode only with "Allow splitting in slowmode" and a short enough slowmode, waiting the slowmode out between parts. |
| PolishWording | Ported | All five formatters, the blocked words, quick disable and the period frequency, with code blocks left alone like PC. |
| EncryptedMessage | Partial | Same cipher as PC (checked against PC's output), so messages encrypt and decrypt across PC and mobile. "Encrypt messages" and "Encryption technique" are in the long-press menu instead of the lock button and its right-click menu; the technique is also a setting and is remembered. Decrypting is a "Decrypt message" entry in the message long-press menu that opens the text in a dialog with a copy button, instead of PC's inline accessory. |
| InvisibleChat | Skipped | Messages are hidden with the StegCloak library (compression, AES-CTR, HMAC and zero-width encoding), loaded from a CDN on PC. Talking to PC users needs a byte-for-byte reimplementation of it, which isn't part of this batch. |
| SendTimestamps | Ported | Backticked `HH:MM` and `H:MM AM` times become `<t:...:t>` like PC. "Insert Timestamp" in the long-press menu opens Android's date and time pickers and a list of the timestamp styles with a preview, then inserts the timestamp at the cursor. |
| SedEnhanced | Ported | The legacy app has no `s/find/replace` at all, so this adds the whole feature with PC's syntax: separators `/ \| $ # @ !`, flags `g i m s`, the `r` flag and "regex by default". Edits the message you're replying to, or your last message in the channel; an empty result deletes it. Says so instead of sending when there is nothing of yours to edit. |
| BetterPlusReacts | Ported | The legacy app has no `+:emoji:` shortcut, so this adds it: sending `+` and one emoji reacts to the last message, `++` to the one before, and so on. Works with picked custom emojis (`<:name:id>`), unicode emojis and `:name:` of standard emojis. |
| AnonymiseFileNames | Partial | Every uploaded file is renamed with PC's three methods (random characters, consistent name, timestamp), keeping the extension (including `.tar.*`). There is no per-file toggle on the upload preview, so the "anonymise by default" setting is gone: with the plugin on, all uploads are renamed. |
| NoReplyMention | Partial | Replies start without a ping unless the author is listed (or not listed, per "Behaviour"), with the same user and role id lists. The mention toggle in the reply bar still works. "Inverse shift reply" is gone since there is no Shift key on a phone. The placeholder ids PC ships as defaults are left out. |
| ReplyPingControl | Skipped | On Android, reply pings reach you as push notifications that Discord's servers decide, and the client can't add or remove those. Only the in-app mention badge could be changed, which would make the plugin look like it works when it doesn't. |
| SilentMessageToggle | Partial | "Send silently" in the long-press menu. The legacy app predates `@silent` and can't add message flags, so a silent message is sent straight to the API with the suppress-notifications flag; it shows up when Discord confirms it rather than instantly, and the text is put back if sending fails. Messages with files or over the length limit are sent normally (with a toast). Same "persist state" and "auto disable" settings. |
| MessageBurst | Ported | Same time window, attachment and space settings. Edits your previous message when it is the last one in the channel; replies, messages with files and merges that would go over the length limit are sent normally. |
| NoDraftLengthLimit | Not applicable | The Android app keeps drafts in memory without truncating them. |
| NoMaskedUrlPaste | Not applicable | The Android chat input doesn't turn a link pasted over selected text into a masked link. |
| ScheduledMessages | Partial | "Schedule Mode" in the long-press menu: the next message opens a choice of a delay in minutes or a date and time. Messages are saved and sent while Endcord runs, checked every few seconds; anything that came due while the app was closed is sent shortly after the next start, like PC. "View Scheduled Messages" (menu and settings) lists them with send now, remove and clear all. Text only: no attachments, no phantom messages in the chat and no reactions on them. |
| SelfDestruct | Partial | "SelfDestruct" toggle in the long-press menu and settings, same delay setting. Like PC, every message of yours that arrives while it is on (from any device) is deleted after the delay, and pending deletions are dropped on restart. There is no red countdown on the messages. |
| PreviewMessage | Partial | "Preview Message" in the long-press menu shows the text as a message only you can see, with mentions and emojis rendered. Attachments aren't previewed. |
| CharacterCounter | Partial | A `count/limit` line above the chat input while typing, with the same colour steps (and setting). No count of the selected text. |
| ChatGPTWriting | Ported | Same local kaomoji, emoji and autocorrect rules as PC (no API is involved). The on/off toggle is in the long-press menu and the settings; the button location setting doesn't apply. |
| BetterCommands | Not applicable | Auto-filling every option and Ctrl+Shift+Enter newlines are desktop command bar features, and `/refresh` dispatches desktop-only command index events. |
| ChatGPT | Ported | `/chatgpt question` and `/chatgpt-info` with the user's own OpenAI key, model, max tokens, system prompt and notification settings. The request runs on the command's background thread and the answer is shown only to you. Temperature is set in percent (0 to 100). |
