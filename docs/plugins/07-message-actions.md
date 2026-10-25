# Batch 07: message actions

Ports of Endcord PC's message, user and channel context menu plugins. On mobile almost all of them become
entries in the message long-press sheet (`com.endcord.plugins.api.MessageActions`). Plugins that act on users
add entries to the user profile sheet, and plugins that act on channels add entries to the sheet shown when
long-pressing a channel or a DM in the channel list (`com.endcord.plugins.actionscommon.UserSheetActions` and
`ChannelSheetActions`). Endcord PC's "Endcord Toolbox" doesn't exist on mobile, so saved items are browsed
from a page opened with a slash command or from the plugin's settings.

| Plugin | Status | Notes |
| --- | --- | --- |
| ViewRaw | Partial | "View Raw" in the message sheet opens a page with the message text and its JSON (API field names, sorted keys; token, e-mail and phone fields are always removed) with copy buttons. Also in the channel sheet and the user sheet (user, profile and member data). Optional "Copy Raw Content" entry. No guild or role data: the app has no guild or role context menu to hook, and PC's left/right click setting has no mobile equivalent. |
| CopyEmojiMarkdown | Partial | "Copy Emoji Markdown" in the message sheet copies `<:name:id>` / `<a:name:id>` of the custom emojis in the message text and its reactions, with a picker and "Copy all" when there are several. Not available in the emoji picker, and the "copy unicode" setting is not ported since default emojis are already plain text in messages. |
| CopyFileContents | Partial | The app has no inline text file preview, so "Copy File Contents" is a message sheet entry for text attachments (detected by file extension). Downloads the file and copies it, up to 256 KB because larger clips fail in Android's clipboard. |
| CopyMediaLink | Partial | "Copy Media Link" in the message sheet copies the original link of the message's image and video attachments and embeds, with a picker when there are several. PC's plain "Copy Link" for non-media links and its clipboard fallback chain don't apply. |
| CopyUserMention | Ported | "Copy User Mention" at the bottom of the user profile sheet copies `<@id>`. |
| CopyUserURLs | Ported | "Copy User URL" at the bottom of the user profile sheet copies `<https://discord.com/users/id>`. |
| CopyStatusUrls | Ported | Long-press a rich presence button (Watch, Listen, ...) on the user profile sheet to copy its link. The link is requested from Discord like on PC. |
| CopyStickerLinks | Partial | "Copy Sticker Link" and "Open Sticker Link" in the message sheet for messages with stickers (same lossless 512px PNG, Lottie JSON and media proxy GIF links as PC). Not available in the sticker picker. |
| CopyProfileColors | Ported | "Copy Profile Colors" and, when the server profile has its own, "Copy Server Profile Colors" at the bottom of the user profile sheet. Same text format as PC. |
| ExportMessages | Ported | "Export Message" in the message sheet writes PC's text format to `<Endcord folder>/exports/message-<id>-<date>.txt`; "Share after export" (on by default, PC's "open after export") opens Android's share sheet with the text. "Copy contacts" in the settings copies friends, blocked users and friend requests as JSON, read from the relationship store so the friends tab doesn't need to be opened first. |
| DownloadAllAttachments | Ported | "Download All Attachments" in the message sheet queues every attachment in Android's download manager into `Download/Endcord`, renaming duplicates like PC. Only images and videos unless "Download all file types" is on. Works from API 24 to 36 without extra permissions. |
| Bookmarks | Ported | "Bookmark" / "Remove Bookmark" in the message sheet. `/bookmarks` or the plugin settings open a page to search, filter by server, jump to, copy the link of and remove bookmarks. Stored in the plugin's settings, newest 1000 kept. |
| MessageTags | Partial | "Tags" in the message sheet toggles PC's preset tags plus the user's own tags (setting). `/tagged` or the settings open a page with search, a tag filter, jump, edit tags and remove. Tags are not drawn as chips on chat messages: the legacy message views have no safe place for an accessory row. Newest 1000 tagged messages kept. |
| MessageReminders | Partial | "Remind me" in the message sheet with PC's presets. A notification (or an in-app notice when notifications are off) opens the message. Endcord can't register manifest receivers, so an AlarmManager alarm (exact when allowed, inexact otherwise) wakes a receiver registered while the plugin runs: reminders fire on time while Android keeps the process alive, including in the background and in Doze. If the process was killed, overdue reminders fire as soon as Endcord is opened (checked on start and on every activity resume). `/reminders` or the settings list and cancel them. Up to 200. |
| ChannelNotes | Partial | "Add note" / "Edit note" in the sheet shown when long-pressing a channel or a DM. There is no channel toolbar button on mobile, so a note is shown as an in-app notice the first time its channel is opened after starting the app (setting); tapping it edits the note. `/notes` or the settings list all notes. No user sheet entry, Discord's own user note is there. Up to 300 notes of 4000 characters. |
| RepeatMessages | Ported | "Repeat" and "Repeat and Reply" (instead of shift-click) in the message sheet. Sends the text, attachment links and stickers without pinging anyone, like PC. Attachments of forwarded message snapshots are not included. |
| QuickMention | Ported | "Quick Mention" in the message sheet adds the author's mention to the chat box through Discord's own mention insertion. Hidden where you can't send messages. |
| FindReply | Ported | "Jump to Reply" in the message sheet searches the loaded part of the channel with PC's three settings. With several replies a list replaces PC's bottom paginator. |
| JumpTo | Ported | "Jump To First Message" / "Jump To Last Message" in the channel and DM long-press sheet. "Jump to their first message" / "Jump to their last message" in the message sheet in servers use Discord's search like PC. |
| ShowMessageEmbeds | Ported | "Show Embed" for links without an embed and "Remove Embed" for embeds whose link is in the text, in the message sheet. Uses Discord's unfurler and PC's link normalisation; the change is local and the next real update of the message restores Discord's embeds, like on PC. |
| ReverseImageSearch | Ported | "Search Image" in the message sheet for messages with images, then a picker with PC's 7 engines and "All", opened in the browser. |
| Quoter | Partial | "Quote" in the message sheet opens a page with PC's quote card drawn natively (grayscale and watermark switches remembered), "Save" to `Pictures/Endcord` and "Send" to upload it to the channel. Uses system fonts instead of the Google fonts, shows custom emojis as `:name:`, and saves PNG only (no GIF). |
| TextScreenshot | Partial | `/txtss` and `/texttoscreen` draw the text as a message from you in Discord's dark theme and send it right away (no upload prompt on mobile). The avatar decoration isn't drawn. |

## Shared helpers (`com.endcord.plugins.actionscommon`)

* `ChannelSheetActions`, `UserSheetActions`: like `MessageActions` for the channel long-press sheet and the user
  profile sheet. Owners call `unregisterAll(name)` in `stop()`.
* `ListStore`: bounded list of Gson records in a plugin's `SettingsAPI`, written on a background thread.
* `BrowserPage`: searchable, filterable list page used by Bookmarks, MessageTags, MessageReminders and ChannelNotes.
* `Common`: names, previews, message links, `openMessage` (opens a channel/message from any screen the way a
  notification tap does) and pickers. `Files`: Endcord folder, download manager and MediaStore helpers.
  `MessageParts`: media, text attachments, custom emojis and stickers of a message. `Images`: avatars and PNGs.
