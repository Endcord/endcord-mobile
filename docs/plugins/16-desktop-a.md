# Batch 16: desktop (a)

Mostly desktop-only plugins: keyboard shortcuts, mouse and hover effects, the desktop voice engine and screen
sharing, Electron and native helpers, devtools and CSS-only effects. They are listed with the reason they can't exist
on the legacy Android app. The ones with a real mobile counterpart are ported: GIF picker, emoji autocomplete,
uploads, folders, the ban dialog, read receipts, reaction buttons, wallpaper and markdown tables.

| Plugin | Status | Notes |
| --- | --- | --- |
| AddAttachments | Skipped | Editing a message on Android only edits its text; adding files would need attachment UI in edit mode plus a multipart edit request, not done in this batch. |
| AltKrispSwitch | Not applicable | The Android noise cancellation toggle already switches between Krisp and off; there is no "Standard" mode to skip. |
| AlwaysAnimate | Not applicable | PC forces animations that only play on hover. Android has no hover: animated emojis, GIFs and stickers follow the app's own "Play animated emojis", "Automatically play GIFs" and sticker animation settings. |
| AppleMusicRichPresence | Not applicable | Reads the desktop Apple Music app through native code. |
| WebRichPresence (arRPC) | Not applicable | Web client bridge for the arRPC desktop server. |
| AutoDNDWhilePlaying | Not applicable | Uses the desktop app's game detection. |
| AutoZipper | Skipped | Zipping chosen file types before upload would need rewriting attachments in the upload flow; not done in this batch. |
| BetterAudioPlayer | Not applicable | Web Audio visualizers for the desktop audio player; the legacy app shows audio files as plain file attachments. |
| BetterBanReasons | Partial | The Android ban dialog already has a free text reason field (what PC's "text input by default" option gives), so the plugin adds a row of your reasons under it; tapping one fills the field. Reasons are a text setting, one per line. PC's per-reason message deletion duration is left out; the dialog's own deletion choice applies. |
| BetterFolders | Not applicable | A second desktop sidebar for server folders. |
| BetterGifAltText | Not applicable | Changes the alt text of GIFs in the web page; the legacy app shows no alt text. |
| BetterGifLoad | Not applicable | The legacy GIF picker already loads Tenor's small `tinygif` previews (`StoreGifPicker`), the lowest quality PC offers. |
| BetterGifPicker | Not applicable | Opens the favorites tab by default; the legacy GIF picker has no favorite GIFs. |
| BetterScreenShare | Not applicable | Desktop screen share bitrate, frame rate and resolution. |
| BetterSettings | Not applicable | Desktop settings menu animations and shortcuts. |
| BetterUploadButton | Not applicable | Left/right click on the desktop upload button. |
| BiggerStreamPreview | Not applicable | A desktop context menu entry for stream previews. |
| BlockKrisp | Not applicable | Krisp ships inside the Android app's native voice engine and only runs while noise cancellation is on; there is no module to block from a plugin. |
| RecordUrMic | Not applicable | Records the microphone through desktop native code. |
| ChannelTabs | Not applicable | Desktop browser-like tabs. |
| CleanerDiscord | Not applicable | CSS that hides newer desktop clutter the legacy app doesn't have. |
| ClickSparkles | Not applicable | Mouse click effect. |
| ClientTheme | Skipped | Tinting the whole app means replacing its theme colors everywhere (what Aliucord themes do); not done as a plugin in this batch. |
| ClipsEnhancements | Not applicable | Desktop clips. |
| ClipUpload | Not applicable | Desktop clips through native code. |
| CollapsibleUI | Not applicable | Collapses desktop sidebars and panels. |
| CommandPalette | Not applicable | Keyboard command palette. |
| CompactCompose | Not applicable | The Android chat input already folds its buttons behind an arrow while you type. |
| ConsoleJanitor | Not applicable | Web console messages. |
| ConsoleShortcuts | Not applicable | Devtools console aliases. |
| CrashHandler | Not applicable | Aliucord already catches crashes and shows the report on the next start; PC's in-page React recovery has no counterpart. |
| CtrlEnterSave | Not applicable | Keybind. |
| CursorBuddy | Not applicable | Follows the mouse cursor. |
| CustomAppIcons | Not applicable | The legacy app has no in-app icon picker; its launcher icon comes from the APK. |
| CustomCursor | Not applicable | Mouse cursor. |
| CustomReactionButtons | Partial | Android has no message hover bar, so each button is an entry of the message long-press sheet that reacts with its emoji (hidden without the Add Reactions permission). Buttons are a text setting, one per line: an emoji, `:name:123` or `<a:name:123>`, then an optional label; changes apply right away, no restart. |
| CustomStreamPreview | Not applicable | Desktop stream preview uploads. |
| Declutter | Not applicable | Removes newer web UI (shop, quests, profile effects) the legacy app doesn't have. |
| DevCompanion | Not applicable | Development tool for the PC repository. |
| DirectFileDownload | Not applicable | Android already downloads files directly. |
| DiscordDevBanner | Not applicable | Web client developer banner. |
| DmReadReceipt | Partial | Same rule as PC: your messages in a DM show "Seen ✓" once the other person sent a message after them, and "Seen · typing..." while they type. It is shown after the timestamp, so on Android only on the first message of each group (grouped messages have no header). The chat redraws when the newest message or their typing changes. |
| DoubleEmoji | Skipped | The Android chat input's emoji picker already stays open while you pick; keeping the reaction picker open with highlighted picks wasn't done in this batch. |
| DragFavoriteEmotes | Skipped | Reordering favorites needs drag and drop in the emoji picker grid; not done in this batch. |
| Dragify | Not applicable | Desktop drag and drop. |
| EndcordToolbox | Not applicable | Desktop title bar button. |
| F8Break | Not applicable | Devtools debugger shortcut. |
| FakeLag | Not applicable | F7 shortcut. |
| FakeNitro | Skipped | Circumvents paid Nitro features. |
| FastGifPicker | Not applicable | Throttles image loading in the web GIF picker; the Android picker loads small `tinygif` previews through Fresco, which already queues, caches and retries requests. |
| FavoriteEmojiFirst | Ported | Favorite emojis (from the emoji picker's favorites) come first in the `:` suggestions. They are moved before Discord cuts the list down, so favorites further down make the cut too, like on PC. |
| FavoriteGifSearch | Not applicable | No-op on PC as well; the legacy app has no favorite GIFs. |
| FileViewer | Not applicable | PDF and Office previews through web viewers; Android opens files in the installed apps. |
| FileSplitter | Skipped | Splitting and rejoining files needs both sides to run the plugin plus new upload and download UI; not done in this batch. |
| FileUpload | Skipped | Uploading to Zipline, S3 and others through PC's native helper would need replacing the Android upload flow; not done in this batch. |
| FixFileExtensions | Ported | Same extension table as PC, applied to every upload (messages and slash command files) where the app finalizes file names (`SendUtils.uniqueifyNames`); matched case-insensitively. PC turns it off while AnonymiseFileNames is on; on Android both apply. |
| FixScreenshare | Not applicable | Desktop screen share crash workaround. |
| FixSpotifyEmbeds | Not applicable | The legacy app doesn't play Spotify embeds in-app. |
| FixYoutubeEmbeds | Not applicable | The legacy app doesn't play YouTube embeds in-app; it opens the YouTube app or browser. |
| FontLoader | Skipped | Using a Google Font as the app font means replacing the typeface of every text view; not done in this batch. |
| FullVCPFP | Not applicable | CSS for desktop voice tiles. |
| GifCaptioner | Not applicable | Captions GIFs through desktop native code. |
| GifCollections | Skipped | Needs a collections tab in the GIF picker, and the legacy picker has no favorites to start from; not done in this batch. |
| GifMaker | Not applicable | Encodes GIFs through desktop native code. |
| GifPaste | Ported | Picking a GIF (trending, category or search) appends its link to the chat input through the app's own "append text" event instead of sending it, and the picker closes as usual. |
| GifProviderSwitcher | Skipped | The legacy picker asks Discord's `/gifs` API for `provider=tenor`; searching Giphy instead would mean replacing the picker's REST calls and mapping Giphy's results, not done in this batch. |
| GreetStickerPicker | Skipped | The legacy "Wave to say hi!" button sends its one sticker; choosing another would need a sticker list on long press, not done in this batch. |
| HideChatButtons | Not applicable | Hides desktop chat bar buttons (gift, GIF, stickers, apps); the Android chat input folds its buttons on its own while typing. |
| HideEndcord | Not applicable | F8 shortcut. |
| HopOn | Skipped | Opening a URL automatically when an incoming message matches a regex; not ported, opening links on its own from other people's messages isn't something this batch adds. |
| IconViewer | Not applicable | Previews the web client's icon components; the Android app's icons are drawables. |
| IdleAutoRestart | Not applicable | Restarts the desktop client. |
| ID Translater | Skipped | The legacy app names mentions only from the users Discord sends with each message (others render as "@invalid-user"), so turning raw IDs into mentions also needs filling the render context's name maps; not done in this batch. |
| ImageFilename | Not applicable | Hover tooltip. |
| ImageZoom | Not applicable | The Android media viewer already has pinch to zoom. |
| InstantScreenshare | Not applicable | Desktop capture sources. |
| KeyboardNavigation | Not applicable | Keyboard navigation of the desktop UI. |
| KeyboardSounds | Not applicable | Physical keyboard sounds; Android keyboards have their own. |
| LimitlessScreenshare | Not applicable | Desktop screen share resolution and frame rate. |
| LiveWallpaper | Partial | Like PC, a faint wallpaper layer over every screen of the app that lets touches through, with the opacity (in percent, up to 50) and brightness settings. Images and GIFs (animated) load from a URL or a `file://` path through the app's image pipeline, decoded at screen size. Videos, sound settings, PC's file picker and blur are left out (API 24 has no view blur). |
| LoadingQuotes | Not applicable | The legacy app's connecting screen has no loading quotes. |
| LoginWithQR | Not applicable | Built into the Android app: Settings has "Scan QR code" to log in on another device. |
| MarkdownTables | Partial | Android text views can't lay out tables, so a GitHub-style table (header, `---` separator with `:` alignment, rows) is redrawn as an aligned monospace table in a code block. Links, custom emojis and known user mentions in cells become plain text, other inline formatting is dropped. Wide tables wrap on narrow screens. There is no Table/Raw toggle. |
