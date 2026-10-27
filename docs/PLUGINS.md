# Plugins

Endcord for Android comes with **303 built-in plugins**: 261 from Endcord PC and 42 made for phones (mostly lookup
and fun commands). They all start off; turn them on in **Settings → Endcord → Plugins**. Endcord PC's popular plugins
come first, in Endcord PC's order and with a **POPULAR** badge, and the page shows how many plugins there are and how
many are on, with filters by status and tag, like Endcord PC's plugin manager.

> **Aliucord plugins don't work in this client.** They are Java and Kotlin code written for the older Discord that
> Aliucord is built on (126.21), while the current Discord is React Native. The Plugins page says so and points people
> who want Aliucord plugins to **Endcord Classic** (the `main` branch), which runs both Endcord's and Aliucord's
> plugins. Vendetta and Revenge plugins can be installed here too.

## Popular plugins (all of Endcord PC's popular list)

| # | Plugin | On your phone | Compared with Endcord PC |
| --- | --- | --- | --- |
| 1 | CustomProfile | Your own avatar, banner, display name, bio and pronouns, only visible to you | No badges or fake Nitro, which would only be good for fake screenshots; for now the display name changes in messages only |
| 2 | MessageLogger | Deleted messages stay in the chat in red with a "deleted" tag, and earlier versions of edited ones show above them; ghost ping alerts; ignored users, channels and servers | The log is cleared when the app closes (the default on PC too) |
| 3 | HideEndcord | Hides Endcord's section of Discord's settings; `/hideendcord` brings it back | A command and a settings button instead of PC's F8 shortcut |
| 4 | FakeNitro | Emojis and stickers you can't use are sent as links; asks first if you don't have the permission | No stream quality part on mobile |
| 5 | SmoothType | Caret and selection colors for text boxes | Android's native text box can't animate its caret, so only the colors |
| 6 | ViewIcons | Tap avatars, banners and server icons to see them full size; long-press to copy a server avatar or the link | No context menu entries |
| 7 | ThemeLibrary | Install themes from the community theme marketplace and Catppuccin without leaving the app | Uses mobile theme sources, since PC's desktop CSS themes don't work on mobile |
| 8 | oneko | A cat that runs to wherever you touch the screen | Touch instead of the mouse |
| 9 | PlatformIndicators | Desktop, web and mobile icons next to the time of messages | Not in the member list or on profiles |
| 10 | RelationshipNotifier | Tells you when a friend, group chat or server removes you; what happened while you were offline shows when you open the app | In-app notices and a history list |
| 11 | SilentTyping | Your typing indicator is never sent; an optional chat bar button and `/silenttype` | An option to show it in DMs |
| 12 | FakeMute | Appear muted or deafened while your microphone and sound keep working; buttons, `/fakemute` and `/fakedeafen` | FakeDeafen is part of the same plugin, not a separate one |

## Other plugins

The descriptions below are the ones the app shows.

### Text commands (11)
Commands that turn what you type into something else and send it: `/bold`, `/ship`, `/calc`, `/morse`, `/uwuify`…

| Plugin | What it does |
| --- | --- |
| BoldText | /bold turns your message into 𝐮𝐧𝐢𝐜𝐨𝐝𝐞 bold (works where markdown can't). |
| Calculator | /calc does quick maths right in the chat box. |
| ClapText | Adds /clap to 👏 put 👏 claps 👏 between 👏 your 👏 words. |
| GoogleThat | Send a web search link for anything with /googlethat |
| LeetText | /leet rewrites your message in 1337 5p34k. |
| MoreCommands | Adds various fun and useful commands |
| ReverseText | /reverse flips your message backwards. |
| ShipCalc | /ship rates the love between two people. |
| SpaceOut | /spaceout p u t s   s p a c e s   between every letter. |
| Starify | Adds /starify to wrap your message in sparkles ｡ﾟ☆. |
| VibeCheck | Adds /vibe to drop a random vaporwave mood into chat. |

### Lookup and translation (9)
Commands that look something up on Discord or the web; Translate also works from the message menu.

| Plugin | What it does |
| --- | --- |
| AvatarGrabber | /avatar grabs the full-resolution avatar of any user (or yourself). |
| FriendInvites | Create, list and revoke friend invite links with /friendinvites |
| HypeSquadSwitcher | Easily switch between HypeSquad houses or remove your badge |
| InRole | See who has a role with /inrole |
| PauseInvitesForever | Pause a server's invites with no time limit, which Discord no longer offers, with /pauseinvites |
| ServerInfo | Allows you to view info about a server |
| SpotifyShareCommands | Share your current Spotify track, album or artist via slash command (/track, /album, /artist) |
| Translate | Translate messages from the message menu, translate what you send, or use /translate (Google Translate) |
| WikiLookup | /wiki pulls a short Wikipedia summary for anything (sent only to you). |

### While sending (18)
Plugins that change a message right before it's sent (`onSend`). They run in a fixed order: text first, then formatting, the signature last.

| Plugin | What it does |
| --- | --- |
| AnonymiseFileNames | Anonymise uploaded file names |
| AtSomeone | Mention a random member of the channel |
| ClearURLs | Automatically removes tracking elements from URLs you send |
| AutoVaporwave | Turn every message you send into ｆｕｌｌｗｉｄｔｈ text automatically. |
| BetterPlusReacts | React to an earlier message by typing +:emoji:, with one + per message back |
| EmbeddedURLs | Turns plain social links into embeddable URLs so posts and videos are fully viewable in Discord instead of forcing users to open the external site. |
| MessageBurst | Merges messages sent within a time period with your previous sent message if no one else sends a message before you. |
| NoReplyMention | Disables reply pings by default |
| NormalizeMessageLinks | Strip canary/ptb from message links |
| PolishWording | Tweaks your messages to make them look nicer and have better grammar. See settings |
| SelfDestruct | Sends messages that are automatically deleted after a configurable delay. Red timer visible on each message. |
| Signature | Adds your signature to the end of every message you send |
| SilentMessageToggle | Adds a button to the chat bar to toggle sending a silent message. |
| TalkInReverse | Reverses the message content before sending it. |
| TextReplace | Replace text in your messages. You can find pre-made rules in the #textreplace-rules channel in Endcord's Server |
| Unindent | Trims leading indentation from codeblocks |
| WriteUpperCase | Changes the first Letter of each Sentence in Message Inputs to Uppercase |
| ZeroWidthSanitizer | Removes invisible zero-width characters from messages to prevent fingerprinting and tracking |

### Incoming messages and filters (11)
Plugins that decide what reaches you: messages, notifications, stickers, calls (`onIncomingMessage`).

| Plugin | What it does |
| --- | --- |
| BlockKeywords | Blocks messages containing specific user-defined keywords, as if the user sending them was blocked. |
| ClientSideBlock | Allows you to locally hide almost all content from any user |
| HideMessages | Hide messages from the message menu until you restart Discord |
| IgnoreCalls | Allows you to ignore calls from specific users or dm groups. |
| iLoveSpam | Do not hide messages from 'likely spammers' |
| NoBlockedMessages | Hides all blocked/ignored messages from chat completely |
| NoPendingCount | Removes the badge count of incoming friend requests and message requests |
| NoProfileThemes | Completely removes Nitro profile themes from everyone but yourself |
| ReplyPingControl | Control whether to always or never get pinged on message replies, with whitelist and blacklist features |
| SilenceUsers | Silences @mention pings and server badge counts from specific users. Regular messages and DMs are untouched. |
| StickerBlocker | Allows you to block stickers from being displayed. |

### Notifications and automation (9)
Keywords, voice channels, new servers and nicknames.

| Plugin | What it does |
| --- | --- |
| AntiDeleteMessage | Automatically resends your messages if someone deletes them. Cache persisted across restarts. |
| AntiNickname | Automatically resets any nickname forcefully assigned to you in a server. Works even without admin permissions. |
| AutoReact | Automatically react to messages containing specific keywords. |
| KeywordNotify | Sends a notification if a given message matches certain keywords or regexes |
| NewGuildSettings | Automatically mute new servers and change various other settings upon joining |
| ReadAllNotificationsButton | Mark every server as read at once with /readall |
| ToastNotifications | Show a pop-up toast notification, configurable for DMs, group, friends, or guild channels. |
| VoiceChannelLog | Logs voice channel activity: joins, leaves, moves, server mutes, cameras and screen shares |
| VoiceJoinMessages | Receive client-side ephemeral messages when your friends join voice channels |

### Message menu (22)
Plugins that add rows to the menu that opens when you long-press a message (`addMessageAction`).

| Plugin | What it does |
| --- | --- |
| CopyEmojiMarkdown | Allows you to copy emojis as formatted string (<:blobcatcozy:1026533070955872337>) |
| CopyFileContents | Copy the contents of text file attachments from the message menu |
| CopyMediaLink | Copy the link of a message's images, videos and files from the message menu |
| CopyStickerLinks | Adds the ability to copy & open Sticker links |
| CopyUserMention | Copy the mention of a message's author from the message menu |
| CopyUserURLs | Copy a link to the profile of a message's author from the message menu |
| DecodeBase64 | Decode base64 content of any message and copy the decoded content. |
| DownloadAllAttachments | Download every attachment of a message at once from the message menu |
| ExportMessages | Share any message as text from the message menu |
| FindReply | Jumps to the earliest reply to a message in a channel (lets you follow past conversations more easily). |
| HideMedia | Hide the attachments and embeds of a message from the message menu |
| Husk | React with husk from the message menu (change the emoji in settings) |
| QuickDelete | Delete your last message in a channel with /deletelast, or any of yours from the message menu without confirming |
| QuickMention | Mention a message's author from the message menu |
| RepeatMessages | Send a message again from the message menu |
| ReverseImageSearch | Search for a message's image on Google Lens, Yandex, SauceNAO and more from the message menu |
| SilentDelete | "Silently" deletes a message. Bypass message loggers by replacing the message with a placeholder. |
| SongLink | Open song links on your streaming service through song.link, from the message menu |
| UnitConverter | Convert metric and imperial units in a message from the message menu |
| UnsuppressEmbeds | Allows you to unsuppress embeds in messages |
| ViewRaw | View and copy the raw content and data of any message |
| VoiceDownload | Download voice messages from the message menu |

### Reminders, scheduled messages and bookmarks (5)
Kept on your phone, and still there after a restart.

| Plugin | What it does |
| --- | --- |
| Bookmarks | Privately bookmark messages (beyond Discord's 50-pin limit) from the message menu, then find and jump to them in the plugin's settings or with /bookmarks |
| MessageReminders | Get reminded about a message later from the message menu. The reminder links right back to it. |
| MessageTags | Tag messages with private labels (TODO, Important, ...) shown next to their time, and find them in the plugin's settings |
| RemindMe | /remindme reminds you of something later with a notice in the chat. Survives restarts. |
| ScheduledMessages | Schedule messages to be sent at a specific time or after a delay. |

### How messages look (16)
Plugins that change the rows of Discord's native chat (`onMessageRow`): the text next to the time, names, colors.

| Plugin | What it does |
| --- | --- |
| CustomTimestamps | Shows message times in a format you choose |
| CustomUserColors | Give any user a custom name color in chat |
| FakeTag | Adds a fake clan tag and badge emoji next to your username. Client-side only. |
| FriendshipRanks | Adds badges showcasing how long you have been friends with a user for |
| IrcColors | Makes username colors in chat unique, like in IRC clients |
| MessageLatency | Displays an indicator for messages that took ≥n seconds to send |
| PinIcon | Adds a pin icon to pinned messages |
| RealtimeTimestamps | Shows the seconds in every message's time (e.g. 15:34:21) |
| ShowMeYourName | Display usernames next to nicks, or no nicks at all |
| ShowRolesInChat | Shows a user's highest role next to their name in chat messages |
| ShowTimeoutDuration | Shows how much longer a user's timeout will last next to their messages |
| SilentEdit | Hides the '(edited)' label on your own edited messages. The message stays — nothing is deleted or resent. |
| Timezones | Shows the local time of the users you choose next to their messages |
| ToneIndicators | Explains tone indicators like /srs and /gen next to them in messages |
| UserMessagesPronouns | Shows people's pronouns from their Discord profile next to their messages |
| WordCount | Shows the word count of messages next to their time |

### Status and activity (7)
Rich presence, saved statuses, appearing idle.

| Plugin | What it does |
| --- | --- |
| AlwaysTrust | Removes the annoying untrusted domain and suspicious file popup |
| CustomIdle | Stops Discord from marking you idle while the app is in the background |
| CustomRPC | Add a fully customisable Rich Presence (Game status) to your Discord profile |
| Experiments | Enable Access to Experiments & other dev-only features in Discord! |
| LastFMRichPresence | Shows what you're listening to on Last.fm as your Rich Presence |
| MusicRichPresence | Rich Presence for what you're playing, from ListenBrainz |
| StatusPresets | Allows you to remember your statuses and set them later |

### Voice channels (4)

| Plugin | What it does |
| --- | --- |
| DisableCallIdle | Disables automatically getting kicked from a DM voice call after 3 minutes and being moved to an AFK voice channel. |
| FollowUser | Follow someone from the message menu to always join the same voice channel as them |
| RandomVoice | Join a random voice channel with /randomvoice |
| VoiceRejoin | Rejoins DM/Server call automatically when restarting Discord. |

### Calls (9)
What happens in a call, and actions on everyone in a channel at once.

| Plugin | What it does |
| --- | --- |
| AntiMoveDeco | Puts you back in your voice channel when someone moves or disconnects you |
| CallTimer | Shows how long you have been in the current voice call |
| PullUserIntoVoice | Pull a message's author into your voice channel from the message menu, and keep pulling them if you like |
| VoiceChatUtilities | Disconnect, move, mute or deafen everyone in your voice channel at once with /voiceall |
| VoiceFakeDetector | Tells you when someone in your voice channel shows as muted or deafened but is talking |
| VoiceServerInfo | Shows the Discord voice server you're connected to and its ping |
| VoiceStats | Shows how long you've spent in voice with each user |
| WaitForSlot | Automatically join a full voice channel when a slot opens. |
| WebcamStartNotifier | Tells you when someone in your voice channel turns their camera on or off |

### Getting around chats (9)
Notes, jumps, replies waiting for you, tables and badges.

| Plugin | What it does |
| --- | --- |
| AntiSnitch | Alerts you with a sound and toast whenever selected users start typing in your current channel. |
| ChannelNotes | Keep private notes on any channel, DM or group chat: rules, who is who, things to remember. Notes stay on your device. |
| Ghosted | Keeps a list of the DMs you haven't answered yet, with a ghost for each |
| ImageLink | Never hide image links in messages, even if it's the only content |
| JumpTo | Jump to the first or the latest message of a chat with /jumpto |
| LastActive | Jump to the last message of yourself or someone else in a chat with /lastactive |
| MarkdownTables | Render GitHub-style markdown tables in Discord messages. |
| ShowBadgesInChat | Shows the message author's badges beside their name in chat. |
| UserVoiceShow | Shows an indicator on messages from people in a voice channel, and lets you join them from the message menu |

### Account and app (8)
Server tags, focus mode, profile presets, startup times, logs.

| Plugin | What it does |
| --- | --- |
| ClanSwitcher | Automatically switches your Discord server tag |
| Declutter | Cleans up Discord by removing profile effects and avatar decorations |
| DiscordDevBanner | Enables Discord's developer banner, which shows the build ID |
| EventLogs | Keeps a log of deleted and edited messages, friends added and removed, and servers you join and leave |
| NoTrack | Stops Discord from collecting analytics, metrics and crash reports about how you use the app |
| FocusMode | One switch for Do Not Disturb, for a while or until you turn it off, and back to your previous status when it ends |
| ProfileSets | Allows you to save and load different profile presets. |
| StartupTimings | Shows how long Endcord and each of its plugins took to start, in the plugin's settings |

### Profiles (5)
Avatars, banners, badges and theme colors from the services Endcord PC uses.

| Plugin | What it does |
| --- | --- |
| CopyProfileColors | Copy the profile theme colors of a message's author from the message menu |
| FakeProfileThemes | Allows profile theming by hiding the colors in your bio thanks to invisible 3y3 encoding |
| GlobalBadges | Adds global badges from other client mods |
| UserPFP | Allows you to use an animated avatar without Nitro |
| USRBG | Displays user banners from USRBG, allowing anyone to get a banner without Nitro |

### Tools (13)
Your own commands, exporting, backups, previews.

| Plugin | What it does |
| --- | --- |
| AlwaysAnimate | Animates anything that can be animated |
| ClearMyMessages | Delete your recent messages in a channel with /clearmessages |
| ContentWarning | Hides messages with trigger words you choose behind a spoiler you tap to reveal |
| CustomCommands | Allows you to create custom slash commands / tags |
| ExportDM | Export a chat's messages, attachments, stickers and reactions as TXT, Markdown or JSON with /exportdm |
| FakeMessage | Send a client-side fake message posed as any user via /fakemsg. Only you can see it. |
| FriendCodes | Create and manage friend invite links in the plugin's settings, to add friends easily |
| HopOn | Hop on! Opens a configurable URL when a message matches a custom regex in the current channel. |
| MemberCount | See how many members a server has, how many are online and how many are in voice, with /membercount |
| MessageFetchTimer | Shows how long it took to fetch messages for the current channel |
| PreviewMessage | Lets you preview your message before sending it. |
| SendTimestamps | Times written like `14:30` become timestamps everyone sees in their own time zone; a chat bar button inserts the current time |
| ServerBackup | Export a server's channels, roles and permissions to a backup file with /serverbackup |

### People (9)
The people you talk to: who they are, their permissions, when they were last online.

| Plugin | What it does |
| --- | --- |
| BetterSessions | See your logged-in devices with exact times and your own names for them, and get told about new logins |
| CopyStatusUrls | Copy the links in the status of a message's author from the message menu |
| ExpressionCloner | Clone custom emojis from a message to your own servers from the message menu |
| IRememberYou | Remembers everyone you talk to in DMs and servers, on your device, so you can always find them again |
| LastOnline | Remembers when your friends were last online; see it in the message menu or with /lastonline |
| MessageTranslate | Auto translate messages to your language with caching, per-channel toggles, and more options. |
| PermissionsViewer | See the roles and permissions of a message's author from the message menu |
| PingNotifications | Customizable notifications with improved mention formatting |
| ReviewDB | Read the ReviewDB reviews of a message's author from the message menu |

### Chat (6)
Splitting long messages, sorting reactions, reply times, messages that mention you directly, vibration and ChatGPT.

| Plugin | What it does |
| --- | --- |
| ChatGPT | Allows using ChatGPT directly in Discord with configurable settings |
| MentionColors | Marks messages that mention you directly differently from @everyone and @here pings |
| ReplyTimestamp | Shows when the message a reply answers was sent, next to the reply's time |
| SortReactions | Sorts reactions by count in chat. |
| SplitLargeMessages | Splits oversized messages into Discord-sized chunks before sending. |
| VibrateOnPing | Vibrates your phone when someone mentions you or DMs you while Discord is open |

### Messages (15)
Link previews, spoilers, quoting, sed, encrypted and invisible messages, a message vault.

| Plugin | What it does |
| --- | --- |
| CustomReactionButtons | Add your own one-tap reactions to the message menu |
| DontRoundMyTimestamps | Always rounds relative timestamps down, so 7.6y becomes 7y instead of 8y |
| EncryptedMessage | Send messages encrypted with a password with /encrypt; only people with the password can read them |
| FakeDM | Injects fake local messages into a DM or group DM with /fakedm. They stay after Discord restarts; only you see them. |
| GifPaste | Makes picking a gif in the gif picker insert a link into the chatbox instead of instantly sending it |
| InvisibleChat | Hide a secret, password-protected message inside an ordinary one with /invisible |
| MessageLinkEmbeds | Adds a preview to messages that link another message |
| MessageLoggerEnhanced | Keeps deleted and edited messages after Discord restarts, with a list to browse them and /deleted |
| MessageVault | Search messages you have read by keyword and person with /vault, even after they scroll away. Indexed on your device only. |
| Quoter | Quote a message into your message box with its author, from the message menu |
| RevealAllSpoilers | Reveal every spoiler in a message from the message menu |
| SedEnhanced | Edit your last message with s/find/replace/, with regular expressions, flags and other separators like s\|a\|b\|g |
| TenorGifFix | Saves Tenor GIFs as real GIFs instead of videos |
| Translate+ | Rewrite your text in fun styles (small caps, upside down, fraktur, pirate...) with /translateplus |
| WhitelistedEmojis | Adds the ability to disable all message emojis except for a whitelisted set. |

### Files and media (8)
Viewing documents and ZIPs without downloading them, favorites, GIF collections and DeArrow.

| Plugin | What it does |
| --- | --- |
| Dearrow | Makes YouTube embed titles less sensationalist, powered by Dearrow |
| FavoriteAnything | Favorite any image, video, or file attachment |
| FileViewer | View Word, Excel and PowerPoint attachments without downloading them, from the message menu |
| FixFileExtensions | Fixes file extensions by renaming them to a compatible supported format if possible |
| GifCollections | Allows you to create collections of gifs. |
| PdfViewer | Preview PDF attachments without downloading them first, from the message menu |
| SaveFavoriteGIFs | Export favorited GIF urls |
| ZipPreview | Previews ZIP contents inside file attachments. |

### Friends and profiles (15)
Blocked users, friend requests, tags, nicknames, connections, pronouns and streaks.

| Plugin | What it does |
| --- | --- |
| BetterActivities | See everything a message's author is doing right now, from the message menu |
| BetterBlockedUsers | A searchable list of the people you blocked, to unblock them in one tap |
| CancelFriendRequest | See the friend requests you sent and cancel them |
| CancelFriendRequestNC | Cancel every friend request you sent with /cancelrequests |
| FriendNicknames | Give people your own nicknames that only you see in chat |
| FriendTags | Give friends your own tags and list everyone with a tag with /friendtag |
| GitHubRepos | See the public GitHub repositories of a message's author from the message menu |
| MutualGroupDMs | See the group DMs you share with a message's author, from the message menu |
| ProfileMedia | Open a message author's avatar and banner in full resolution from the message menu |
| PronounDB | Shows people's pronouns from PronounDB next to their messages |
| ShowConnections | See the accounts a message's author has connected (GitHub, Steam, Spotify...) from the message menu |
| ShowSongName | Shows song name instead of artist for Spotify activity |
| SortFriendRequests | Your incoming friend requests, newest first, to accept or ignore in the plugin's settings |
| Streaks | Shows a streak next to a user when you exchange DMs with them on consecutive days. |
| WhoReacted | See who reacted to a message with each emoji, from the message menu |

### Servers (12)
Ban reasons, invites, roles, server search and member tags.

| Plugin | What it does |
| --- | --- |
| AutoDisconnectAndAutoMute | Automatically disconnect or mute selected users from voice channels |
| BetterBanReasons | Ban with /ban and your own saved reasons to pick from |
| BetterRoleContext | See a role's color, icon, members and permissions with /roleinfo |
| BlurNSFW | Hides attachments in age-restricted channels behind a spoiler until you tap them |
| GreetStickerPicker | Wave to someone in a new DM or a new member with the sticker you pick, with /greet |
| GuildPickerDumper | Share the links of every emoji and sticker of a server with /dumpemojis |
| InviteDefaults | Create invites with your own defaults for how long they last and how many uses they have, with /invite |
| MoreUserTags | Adds tags for webhooks and moderative roles (owner, admin, etc.) |
| MutualServerMembers | Compare two servers you're in and see which members are in both, with /mutualmembers |
| ServerSearch | Find a server by name with /servers and open it from the result |
| SurfaceTranslate | Translate a channel's name and topic with /translatechannel |
| UrlHighlighter | Colors messages with links that match your patterns |

### Status, activity and sounds (9)
A status that follows what you're doing, game and Spotify visibility, volumes and Discord's sounds.

| Plugin | What it does |
| --- | --- |
| AutoDNDWhilePlaying | Automatically updates your online status (online, idle, dnd) when launching games |
| CustomSounds | Customize Discord's sounds. |
| ExitSounds | Play soundboard sounds when you disconnect from voice. |
| GameActivityToggle | Adds a button beside the message box and /gameactivity to show or hide what you're playing |
| IdleAutoRestart | Reloads Discord when you come back after leaving it in the background for a while, so it starts fresh, but never during a call |
| NotificationVolume | Save your ears and set a separate volume for notifications and in-app sounds |
| SpotifyActivityToggle | Adds a toggle button for Spotify activity visibility. |
| StatusWhileActive | Automatically updates your online status when in a voice channel. |
| UniversalVolume | Sets everyone in your voice channel to the same volume, and keeps new people who join at that level too. |

### Getting around the app (18)
Pinning or hiding DMs and servers, recent channels, counters, themes, StreamProof and quick actions.

| Plugin | What it does |
| --- | --- |
| BetterInvites | See where an invite leads, who made it and when it expires, before joining, with /inviteinfo |
| ConsoleJanitor | Turns off Discord's console logging, which saves work on slower phones |
| EndcordToolbox | Adds a button beside the message box with Endcord quick actions: reload, turn off plugins, debug info and safe mode |
| FakeConnections | Add fake connections to your own profile, visible only to you. |
| HideServers | Hide servers from your server list with /hideserver, and bring them back from the plugin's settings |
| IconViewer | Browse and search all of Discord's icons in the plugin's settings, and copy their names |
| ImplicitRelationships | See the people Discord thinks you talk to most, even if they aren't your friends, with /implicit |
| OpenInApp | Open links in their respective apps instead of your browser |
| PinDMs | Pin DMs to the top of your DM list with /pindm |
| QuickThemeSwitcher | Switch between your installed themes with /theme or a button beside the message box |
| RecentChannelSwitcher | Go back to the channels and DMs you opened recently with /recent |
| RecentDMSwitcher | Go back to the DMs you opened recently with /recentdms |
| ServerListIndicators | See how many of your friends are online and how many servers you're in with /indicators |
| ServerPinner | Pin servers to the top of your server list with /pinserver, without changing your folders |
| StreamProof | Hides messages and their images while you share your screen or record it. Toggle via chat bar button. |
| UnreadCountBadge | See how many unread messages each channel of a server has with /unread |
| VoiceCount | See how many people are in each voice channel of a server with /voicecount |
| WhosWatching | See who is watching your stream with /viewers |

### Lookup and fun commands (38)
Dictionary, weather, currencies, country and holiday info, earthquakes, code packages, games… Only you see the results of lookups.

| Plugin | What it does |
| --- | --- |
| Advice | Send a random piece of advice with /advice |
| AnimeLookup | Look up an anime's score, episodes and status with /anime |
| BoredActivity | Get an idea of something to do with /bored |
| CatFacts | Send a random fact about cats with /catfact |
| CharInfo | See the Unicode code points of every character in a text with /charinfo |
| ColorInfo | See a color's RGB and HSL values, or get a random one, with /color |
| Countdown | See how long is left until a date with /countdown |
| CountryInfo | Look up a country's capital, population, languages and currency with /country |
| CryptoPrices | See a cryptocurrency's price and its change today with /crypto |
| CurrencyConverter | Convert between currencies at today's rates with /currency |
| Dictionary | Look up what an English word means with /define |
| DiscordStatus | Check whether Discord itself is having problems with /discordstatus |
| Earthquakes | See the latest strong earthquakes around the world, or near a place, with /earthquakes |
| Emojify | Write a message in big letter emojis with /emojify |
| GitHubLookup | Look up a GitHub user or repository with /github |
| Hash | Get the SHA-256 hash of a text with /sha256 |
| Holidays | See a country's next public holidays with /holidays |
| Jokes | Send a random joke with /joke |
| LoremIpsum | Put placeholder text in the message box with /lorem |
| MinecraftSkin | Send a Minecraft player's skin with /mcskin |
| MinecraftStatus | See whether a Minecraft server is online and how many are playing with /mcstatus |
| NpmLookup | Look up an npm package's version, licence and downloads with /npm |
| PasswordGenerator | Make a strong random password with /passwordgen; only you see it, and it is copied |
| Pokedex | Look up a Pokémon's types and stats with /pokemon |
| QRCode | Send a QR code of any text or link with /qr |
| Quotes | Send a random famous quote with /quote |
| RandomFacts | Send a random fact with /fact |
| RecipeFinder | Find a recipe for a dish with /recipe |
| RockPaperScissors | Play rock, paper, scissors with /rps and send the result |
| ShortenURL | Shorten a link with /shorten; the short link goes in the message box |
| SnowflakeInfo | See when any Discord ID (a user, message, server...) was made with /snowflake |
| SpaceLaunches | See the next rocket launches with /launches |
| SteamLookup | Look up a game's price on Steam with /steam |
| Trivia | Answer a random trivia question with /trivia |
| UrbanDictionary | Look up slang on Urban Dictionary with /urban |
| UUIDGenerator | Make a random UUID with /uuid and copy it |
| Weather | See the weather anywhere with /weather |
| Xkcd | Send an xkcd comic, the latest, a random one or a number, with /xkcd |

### Fun and wellbeing (5)
Plugins drawn on Endcord's screen overlay, and Wellbeing.

| Plugin | What it does |
| --- | --- |
| ClickSparkles | Sprinkles little neon sparkles wherever you touch |
| Jumpscare | Adds a configurable chance of jumpscaring you whenever you open a channel. Inspired by Geometry Dash Mega Hack |
| Moyai | Plays a 🗿 sound effect whenever a moyai emoji is sent or reacted in the chat you have open |
| Snowfall | Let it snow on Discord |
| Wellbeing | A gentle, private dashboard of how you use Discord: screen time, messages and break reminders. Everything stays on your phone. |

## Writing a plugin

Like on Endcord PC, every plugin has its own folder: `bundle/src/plugins/<pluginName>/index.ts(x)`. Code that several
plugins use lives in `bundle/src/plugins/shared/`. The build generates `bundle/src/plugins/manifest.ts` from the
folders, and stops if a folder defines more than one plugin.

Each plugin is defined with `definePlugin` (`bundle/src/plugins/api.ts`). Anything that touches Discord goes through
the shared hooks in `bundle/src/plugins/hooks.tsx`; each is patched into Discord once and shared by every plugin:

```tsx
// bundle/src/plugins/example/index.ts
export default definePlugin({
    id: "endcord.example",
    name: "Example",                       // the same as its name on Endcord PC
    description: tx("What it does"),       // Endcord PC's English description, so its translations come for free
    settings: { enabled: { type: "boolean", label: tx("Label"), default: true } },
    start({ store, cleanup }) {
        cleanup(
            onSend("example", content => store.enabled ? content.toUpperCase() : undefined),
            addMessageAction({ key: "example", icon: "CopyIcon", label: () => t("Copy"), onPress: m => copy(m.content) }),
            command({ name: "example", description: tx("Does something"), run: () => "hello" }),
        );
    },
});
```

- `onSend` changes a message before it's sent, or returns `null` to not send it; `onIncomingMessage` hides or
  changes incoming messages; `onMessageRow` changes how a message is drawn; `addMessageAction` adds a row to the
  message menu; `command` adds a slash command with a translated description.
- Every callback is isolated: if one throws, the error is logged and the callback skipped, and the others keep running.
  Flux interceptors catch their own errors too, so a plugin can't stop Discord from handling an event.
- The settings page is generated from the schema; use `SettingsComponent` for anything more. Prompt, choice and text
  dialogs are in `ui/dialogs.tsx`, log lists in `ui/LogList.tsx` and persistent timers in `scheduler.ts`.
- Discord's modules can also be found by their source path: `moduleAt("modules/...tsx")`. Paths last longer than
  name lookups.
- If a module it needs is missing, the plugin throws; Endcord turns it off and tells the user. Discord never crashes.
- All user-facing text goes through `t()` or `tx()`. `bun run i18n` takes the translations from Endcord PC, and
  missing ones go in `overrides.json`. CI runs it with `--strict`: an untranslated string stops the build.
- The emulator test (`.github/workflows/emulator.yml`) turns every plugin on and off in the real Discord and tries
  the hooks with real messages.
