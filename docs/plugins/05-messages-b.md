# Batch 05: messages (b)

Plugins that change how messages render in the chat list. The ones that touch message rows share a single set
of hooks in `com.endcord.plugins.messagesbcommon` (`ChatHooks`): one hook on
`WidgetChatListAdapterItemMessage.onConfigure`, one around `processMessageText` / `DiscordParser.parseChannelMessage`
for the message text, and one on `configureReplyName` for reply previews. `SendHooks` there rewrites messages
before `MessageManager.sendMessage` / `editMessage`, the mobile counterpart of PC's `onBeforeMessageSend` and
`onBeforeMessageEdit`.

The legacy app has no hover, so plugins that show a tooltip on PC use a tap or show the information inline.

| Plugin | Status | Notes |
| --- | --- | --- |
| ShowMeYourName | Partial | Same three display modes, display name option and reply preview option, applied to the author name and reply previews. The friend nickname setting and the streamer mode username masking are left out: Discord 126.21 has neither friend nicknames nor streamer mode. |
| MessageColors | Ported | Hex (`#39f`, `#FF0042`), `rgb()`, `rgba()` and `hsl()` codes are shown as text color, background color (with contrasting text) or a small colored square on either or both sides. Codes inside code, links and mentions are left alone. The short hex setting applies immediately instead of after a restart. |
| WordCount | Ported | Adds a small muted "N words, M characters" line at the end of messages with more than five words. |
| PinIcon | Ported | Pin icon after the timestamp of pinned messages. Grouped messages have no header on Android, so there the icon goes after the text. |
| ReplyTimestamp | Ported | The replied-to message's time is shown after its author's name: just the time on the same day, otherwise Discord's own "Today at" / date format. |
| CustomTimestamps | Partial | Custom Moment.js format for the timestamp next to the author name, with `[calendar]` (and its four formats) and `[relative]`. Android has no timestamp tooltips, aria labels or compact mode, so only the cozy format is offered. Moment.js tokens are implemented natively: `L`, `LL`, `LT` and friends follow the device locale and 12/24 hour setting, `[relative]` is worded by Android (ICU) and computed when the row is shown, and empty calendar formats fall back to translated defaults. |
| RealtimeTimestamps | Partial | Header timestamps show seconds (24 or 12 hour format). No tooltip or compact mode on Android. A message's time never changes, so rows are not re-rendered every second; nothing visible is lost. |
| DontRoundMyTimestamps | Partial | Discord's own relative timestamps (`<t:…:R>`) on Android already round down (via `DateUtils.getRelativeTimeSpanString`) and switch to a date after a week. The plugin makes the `[relative]` placeholder of CustomTimestamps round down too. |
| ImageLink | Ported | Disables `MessagePreprocessor.stripSimpleEmbedLink`, which hides a message's text when it is a single link to an image or video. |
| NoMosaic | Not applicable | The legacy app has no image mosaic: every attachment is its own full-width row. |
| FixImagesQuality | Skipped | Chat image URLs are built from the on-screen size in `EmbedResourceUtils.getPreviewUrls`, which doesn't get the original size; a reliable port needs separate patches in the attachment, embed and media viewer code that couldn't be verified without a device. |
| UnsuppressEmbeds | Ported | "Unsuppress Embeds" / "Suppress Embeds" in the message long-press sheet, by patching the message flags. Only shown when the change can succeed: your own messages need Embed Links (or a DM), other people's need Manage Messages. Endcord PC always offers it on other people's messages. |
| MessageLinkEmbeds | Skipped | Would need a new kind of chat list row that renders another message (author, content, images) and fetches it; too large for this batch. |
| ValidReply | Partial | Reply previews that say the message couldn't be loaded get a "Tap to load" hint; tapping fetches the message and fills in the preview (or marks it deleted, like PC). PC loads it on hover. |
| ValidUser | Not applicable | The Android app names mentions from the users Discord sends along with each message (`MessageUtils.getNickOrUsernames`), so it doesn't have the web client's uncached "@unknown-user" mentions. The remaining "@invalid-user" mentions are users Discord itself doesn't return. |
| Unindent | Ported | Code blocks are unindented when shown, and when a message is sent or edited, like PC. |
| FixCodeblockGap | Ported | Removes the newline after a closing code fence before the message is parsed, which is what causes the gap on Android too. The newline is kept when the next line is a quote, list or header, which only parse at the start of a line. |
| ToneIndicators | Partial | Tone indicators (`/srs`, `/gen`, custom ones) are underlined; tapping one shows its meaning, since there is no hover. Same prefix and custom indicator settings. |
| MentionColors | Skipped | The server and channel list badges only know a mention count (`StoreMentions`); telling direct mentions from @everyone needs tracking every mentioning message and patching both list adapters. Not done in this batch. |
| MentionAvatars | Skipped | Mentions are plain text spans in the legacy app; showing avatars would need Fresco image spans per mention, which wasn't done in this batch. |
| MessageLatency | Partial | The latency bars (same colors and rules as PC) appear after the timestamp with a short delay like "3s" next to them, instead of a hover tooltip. Like PC, grouped messages show nothing. |
| MessageFetchTimer | Skipped | The legacy app has no chat bar button area to show the timing in, and a toast on every channel switch would be noise. |
| SortReactions | Ported | Reactions are sorted by count, keeping Discord's order for equal counts. |
| ReactionTimestamps | Ported | The reactions sheet shows when each reaction was added, for reactions received while the app is running (same limitation as PC). |
| WhoReacted | Skipped | Needs a REST request for every reaction while scrolling plus avatar views inside each reaction chip. |
| MoreJumboEmoji | Ported | Patches `MessagePreprocessor.processNode` so the built-in 27 emoji limit for jumbo emoji becomes the configured threshold, or no limit. |
| RichMagnetLinks | Ported | Magnet links become a mention-style chip with a link icon and the file name. Tap opens the link in a torrent app, long-press copies it. |
| UrlHighlighter | Partial | Patterns are entered as text, one per line with an optional color (`*.example.com #eb7396`), as there is no color picker in the settings page. Only links in message text are highlighted: the "also highlight URLs in embed content" option is left out. |
| Dearrow | Skipped | Needs replacing the title and thumbnail inside the embed renderer plus a DeArrow lookup per YouTube embed; not done in this batch. |
| EmbeddedURLs | Ported | Rewrites TikTok, X/Twitter and Instagram links when sending. Unlike PC, which only handles a message that is a single link, every link in the message is rewritten, and the forms without `www.` are covered too. |
| NormalizeMessageLinks | Not applicable | The Android app builds message links from its own `discord://app/channels/…` route and shares them on discord.com; it never produces canary or ptb links. |
