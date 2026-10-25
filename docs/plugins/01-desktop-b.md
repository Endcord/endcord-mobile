# Batch 01: desktop (b)

Mostly desktop-only plugins: keyboard shortcuts, mouse and hover effects, windows and title bars, Electron and native
helpers, the desktop voice engine and screen sharing, devtools, CSS-only effects and fixes for the web client. They are
listed with the reason they can't exist on the legacy Android app. The ones with a real mobile counterpart are ported;
SilentTyping and ReverseText are the reference ports from the start of the project.

| Plugin | Status | Notes |
| --- | --- | --- |
| SilentTyping | Ported | Your typing indicator is never sent, with the option to still show it in DMs. |
| ReverseText | Ported | `/reverse` sends your message backwards. |
| MessageLinkTooltip | Not applicable | Previews message links, replies and forwards in a hover tooltip; the Android app has no hover. Tapping a message link already jumps to the message. |
| MessageVault | Skipped | A local index of everything you read with its own search, timeline and collections screens; too large for this batch. |
| MicLoopbackTester | Not applicable | Uses the desktop voice engine's loopback test from the user panel; neither exists in the Android app. |
| MiddleClickTweaks | Not applicable | Middle mouse button behaviour. |
| MoreQuickReactions | Not applicable | The Android long-press sheet already fills its quick reaction row with as many recent emojis as fit the screen width (`WidgetChatListActions.configureAddReactionEmojisList`). |
| MoreStickers | Skipped | Third-party sticker packs (LINE and others) fetched through PC's native helper, shown in a new picker tab; the Android sticker picker would need its own pack browser. |
| MotionBlur | Not applicable | A WebGL/CSS motion blur over the web UI. |
| MusicControls | Not applicable | A desktop player panel with lyrics that talks to the music services through PC's native helpers; Android's own media notification controls playback. |
| NeonGlow | Not applicable | CSS glow on hover. |
| NeverPausePreviews | Not applicable | Stops the desktop client from pausing stream and PiP previews when its window loses focus; the legacy app has no such previews. |
| NewPluginsManager | Not applicable | Built into Endcord mobile: plugins added by an update are marked as new on the plugins page and announced once (`com.endcord.plugins.NewPlugins`). |
| DisableDeepLinks | Not applicable | Only for Discord in a web browser, which tries to open the desktop app. |
| NoDevtoolsWarning | Not applicable | Hides the devtools console banner; there is no console. |
| NoF1 | Not applicable | Keyboard shortcut. |
| NoMiddleClickPaste | Not applicable | Linux middle-click paste. |
| NoRPC | Not applicable | The desktop app's local RPC server; the Android app has none. |
| NoServerEmojis | Ported | Filters the `:` emoji suggestions with the same three choices as PC. Typing a server emoji's `:name:` in full still turns it into the emoji, like on PC, since only the suggestion list is filtered. |
| NoSystemBadge | Not applicable | Taskbar and tray unread badge; Android launcher badges come from the system's notification settings. |
| NoSystemHelper | Not applicable | Windows Discord System Helper prompt. |
| NotificationTitle | Not applicable | Rewrites desktop notification titles; Android push notifications are built by the app's FCM `NotificationRenderer` from the data Discord's servers send, a different path. |
| oneko | Not applicable | A cat that follows the mouse cursor. |
| OpenInApp | Not applicable | Android already opens Spotify, Steam, Epic, Tidal and other links in their apps through app links. |
| PartyMode | Not applicable | The legacy Android app has no party mode. |
| PdfViewer | Not applicable | Inline PDF previews through pdf.js and PC's native helper; the legacy app shows PDFs as file attachments that open in the device's PDF viewer. |
| PictureInPicture | Skipped | Adds a picture-in-picture button to video players; would need Android picture-in-picture support for the app's media viewer, not done in this batch. |
| PlainFolderIcon | Ported | Closed server folders show the folder icon in the folder's color instead of the grid of four server icons (`ServerFolderView`). |
| QuickDelete | Not applicable | Keyboard shortcut. SilentDelete's `/silentpurge` and the message long-press sheet cover deleting on mobile. |
| QuickReply | Not applicable | Ctrl+Up/Down keybinds. |
| QuickThemeSwitcher | Not applicable | Keyboard shortcuts for desktop CSS themes. |
| ReactErrorDecoder | Not applicable | Decodes React errors; the Android app isn't React. |
| ReadableSpoilers | Skipped | An outline around hidden spoilers needs replacing the app's spoiler spans while text renders; not done in this batch. |
| RecentChannelSwitcher | Not applicable | Ctrl+Tab switcher. |
| RecentDMSwitcher | Not applicable | Ctrl+Tab switcher. |
| RemixRevived | Not applicable | Remix is the newer clients' image editor; the legacy app has no Remix to revive. |
| ReorderAttachments | Skipped | The chat input's attachment preview has no reordering; it would need a drag and drop list in FlexInput, not done in this batch. |
| ReplaceGoogleSearch | Not applicable | Replaces the "Search with Google" entry of the desktop text context menu, which the legacy app doesn't have. |
| SaveFavoriteGIFs | Not applicable | The legacy app has no favorite GIFs to export. |
| SekaiStickers | Skipped | A canvas sticker maker with its own fonts and character art; would need a drawing screen, not done in this batch. |
| ShikiCodeblocks | Not applicable | Highlights code with Shiki (Oniguruma WebAssembly and TextMate grammars) rendered as HTML; the legacy app's code blocks are text spans. |
| ShowAllMessageButtons | Not applicable | Shift-hover message buttons; Android shows every action in the long-press sheet. |
| SidebarChat | Not applicable | Desktop sidebar and popout windows. |
| SmoothType | Not applicable | CSS caret animation. |
| SmoothUI | Not applicable | CSS transitions. |
| Snowfall | Skipped | A decorative snow overlay; not ported in this batch. |
| SongLink | Partial | PC shows service buttons under every song link. On Android, "Song links" in the message long-press menu (for the same Spotify, Apple Music, YouTube Music and Tidal links) looks the song up on song.link in the background and lists the services; tapping one opens it, in the service's app when installed. `/musiclink` sends the formatted list like on PC. The country and header settings are kept; the per-service toggles and "open in native app" switches are left out (Android always offers the app). |
| SongSpotlight | Skipped | Songs on profiles come from a third-party service with its own Discord sign-in and need new profile UI; not ported in this batch. |
| SpotifyControls | Skipped | A Spotify player above the desktop account panel, driven by Spotify's Web API; the legacy app has no account panel and the player UI wasn't rebuilt in this batch. |
| StartupTimings | Not applicable | Web client startup timings. |
| StereoScreenshareAudio | Not applicable | Patches browser WebRTC SDP (Vesktop and similar). |
| StickerPaste | Not applicable | The legacy chat input can't hold a pending sticker next to text; the sticker picker always sends right away. |
| StreamerModeOnStream | Not applicable | The legacy Android app has no streamer mode. |
| StreamingCodecDisabler | Not applicable | Desktop voice engine codec settings. |
| StreamProof | Skipped | Hiding messages, images and the DM list while screen sharing would need covering many separate views; not done in this batch. |
| SuperReactionTweaks | Not applicable | The legacy app has no super reactions. |
| ThemeAttributes | Not applicable | Adds data attributes to the web DOM for CSS themes. |
| ThemeLibrary | Not applicable | A library of desktop CSS themes. |
| TidalEmbeds | Not applicable | Replaces TIDAL links with an embedded web player. |
| Title | Not applicable | Window title. |
| ToggleVideoBind | Not applicable | Keybind. |
| TriviaAI | Skipped | Sends trivia questions with chat context to an OpenAI-compatible API with your key; not ported in this batch. |
| UnlimitedFavoriteGIFs | Not applicable | The legacy app has no favorite GIFs. |
| UserpluginInstaller | Not applicable | Installs PC userplugins from source with native git and build tooling; Aliucord installs plugins its own way. |
| VoiceChatDoubleClick | Not applicable | Double-click on the desktop channel list. |
| VCPanelSettings | Not applicable | Desktop voice panel and voice engine settings. |
| GpuBinder | Not applicable | Windows Registry GPU preference. |
| rzStudioAudio | Not applicable | Patches the desktop voice engine's Opus settings. |
| VoiceMessageTranscriber | Not applicable | Runs Whisper through PC's native helper; the legacy app has neither that runtime nor voice message playback. |
| VoiceSettings | Not applicable | Desktop voice engine options (Opus bitrate, stereo capture, PTT delay); the Android voice engine only exposes the settings Discord's own voice settings show. |
| VoiceVUMeters | Not applicable | Needs per-user audio levels from the desktop voice engine. |
| WebContextMenus | Not applicable | Web client only. |
| WebKeybinds | Not applicable | Web client keybinds. |
| WebpackTarball | Not applicable | Exports the web client's webpack sources. |
| WebRTCLeakPrevent | Not applicable | Forces browser WebRTC relay-only ICE; Android voice runs on Discord's native media engine, not WebRTC ICE policies. |
| WebScreenShareFixes | Not applicable | Chromium screen share bitrate cap. |
| WhosWatching | Not applicable | A hover tooltip over the desktop screen share icon. |
| WigglyText | Skipped | Needs a new markdown rule and an animated text span; not done in this batch. |
| XSOverlay | Not applicable | Forwards notifications to a desktop VR overlay. |
| YoutubeAdblock | Not applicable | Blocks ads in desktop YouTube embeds and WatchTogether; the legacy app opens YouTube links in the YouTube app or browser. |
| ZIP+ | Skipped | Browsing zip attachments needs downloading them and a file browser screen; not done in this batch. |
| ZipPreview | Skipped | Same as ZIP+: needs a download and a file list screen; not done in this batch. |
| BadgeAPI | Not applicable | An API for other PC plugins. Badges on mobile are drawn by ShowBadgesInChat with `identitycommon`. |
| ConcatenatedComponentExtractor | Not applicable | Webpack internals of the web client. |
