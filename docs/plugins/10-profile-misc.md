# Batch 10: profile and misc

Ports of Endcord PC's profile cosmetics, account helpers and a few small UI tweaks. The legacy Android app
(126.21) predates profile themes and avatar decorations, so the plugins built on those either map onto what
the app does have (the banner color) or don't apply. Everything that talks to Discord does so only when the
user asks (HypeSquadSwitcher) or for the user's own account within their own permissions (AntiNickname).
The cosmetic plugins (FakeProfileThemes, CustomFolderIcons) only change what this device shows and send
nothing to Discord.

| Plugin | Status | Notes |
| --- | --- | --- |
| AccountPanelServerProfile | Partial | The Android app has no account panel. Its closest equivalent is long-pressing the You tab, which opens the status sheet: this adds "View server profile" there (or "View profile" outside servers), which opens your own profile sheet with your server profile. The "prioritize server profile on tap" option is left out because tapping the You tab opens settings. |
| AllConnectionsEnabled | Partial | Settings > Connections > Add shows the platforms the app hides (Battle.net, League of Legends, Samsung Galaxy, Skype) and PlayStation, which is behind an experiment. As on PC it doesn't make a connection work if Discord no longer supports it, and the "(Disabled)" label isn't added. Platforms newer than the app (Epic Games, Riot, Roblox, ...) don't exist in it. |
| AntiNickname | Partial | Resets a nickname someone gives you with the normal "change my nickname" route, so only in servers where you have Change Nickname (or are owner or administrator); PC's server profile route that works without that permission isn't used. Nicknames you set from this app are kept; a "Servers to leave alone" list covers nicknames set from other devices. Only actual nickname changes are reset (not every member update), at most 3 times per server in 10 minutes, and a server is left alone for the session after a failed or rate-limited reset. |
| BetterImageEditor | Not applicable | Android crops avatars and banners with uCrop's crop screen, not Discord's web image editor, so there is no editor dialog to keep a shelf of pictures or crops in. |
| ColorSighted | Ported | Status icons (member list, profile, avatars) are drawn as plain dots in their color: idle, do not disturb, offline and streaming lose their moon, minus, ring and arrow shapes. The phone icon of mobile users is kept, as on PC. |
| CustomFolderIcons | Partial | Pick a folder and paste an image link on the plugin's settings page (there is no folder context menu on mobile). A closed folder shows the picture instead of its server grid; an open folder keeps Discord's folder icon. The icon size is one setting for all folders instead of per folder. Images are downloaded once per session and scaled down. |
| CustomProfile | Skipped | A very large plugin that spoofs your own username, avatar, banner, bio, badges (including Discord Staff), Nitro, email and phone. On Android the current user object also feeds the account settings screens that send values back to Discord, so a spoof can't be guaranteed to stay local, and fake staff badges and Nitro mostly serve fabricated screenshots. |
| Decor | Not applicable | The Android app predates avatar decorations and has nowhere that draws them; creating decorations also needs Decor's web sign-in. |
| FakeProfileThemes | Partial | Reads 3y3 colors hidden in bios, same encoding as PC. The app has no profile themes, only a banner color, so the primary color is used as the profile sheet's banner color when there is no banner image (by default only when the profile has no banner color of its own). "Copy 3y3" on the settings page builds the invisible text from two hex colors for you to paste in your bio. Nothing is sent to Discord. |
| FullUserInChatbox | Not applicable | The Android chat box is a plain text field: a mention there is text, not a component that could be tapped or long-pressed. |
| HypeSquadSwitcher | Ported | `/hypesquad house:` joins Bravery, Brilliance or Balance, or removes the badge, for your own account. The settings page has a "Change HypeSquad house" button (marking your current house) instead of PC's dropdown that applies on change, so nothing is sent until you pick. |
| NoProfileThemes | Not applicable | The Android app predates profile themes and never draws them, so there is nothing to remove. |
| NoUnblockToJump | Not applicable | The Android app has no "unblock to jump" prompt; blocked users' messages are only collapsed in the chat. |
| UniversalMention | Ported | Typing `@` lists every loaded member of the server, including those who can't see the channel (the app normally drops them). "Global mention" adds every user the app knows about, in servers and DMs, optionally only people you have a DM with. As on PC, only members the app has loaded can be suggested. |
| UnlockedAvatarZoom | Ported | Raises the zoom limit of the crop screen (uCrop), which Android uses for avatars, banners and server icons. The app's own limit is already 10x (PC's setting defaults to 4x), so the setting goes from 2 to 100, default 25. |
