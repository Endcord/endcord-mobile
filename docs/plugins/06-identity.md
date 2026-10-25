# Batch 06: identity

Plugins that decorate who wrote a message: badges, roles, colors, pronouns, timezones, platforms, tags.
Everything on message rows goes through `ChatHooks` (`afterConfigure`, `timestampSuffix`, `decorateText`); none
of these plugins patch the chat list themselves. Shared helpers live in `com.endcord.plugins.identitycommon`:

* `Header`: the row's name, tag, timestamp and reply name views. On Android the header is one line (name, role
  icon, tag, timestamp), so what Endcord PC shows right after the name (badges, role, platform icons, friend icon)
  is put in front of the timestamp text. The name itself is left alone, since ShowMeYourName and others rewrite
  it. Grouped messages have no header on Android, so they show nothing, like PC's message decorations.
* `Icons` (shared tinted drawables), `RemoteImages` (a few remote badge icons, loaded once in the background,
  failures logged once and never retried), `Members` and `Presences` (in-memory store lookups),
  `ChatRefresh` (rebinds the visible chat after a setting or downloaded data changes), `XXHash64`.

The legacy app has no hover or right-click: tooltips are left out and context menu entries are message long-press
entries (acting on the message's author).

| Plugin | Status | Notes |
| --- | --- | --- |
| ShowBadgesInChat | Partial | Endcord contributor badge, Discord profile badges (from the author's public flags, drawn with the app's own badge icons, no network) and the Nitro badge, before the timestamp. Nitro is only known for users whose profile the app loaded, as on PC. The drag and drop order editor is three switches with a fixed order; PC's donor badge list is never filled on PC either, so it is left out. No tooltips. |
| ShowRolesInChat | Ported | Shield icon in the role color plus the highest role's name before the timestamp. "Hide Role in Chat" and "Unhide Roles in Chat" are message long-press entries for the author's roles (PC: right-click), and a settings button unhides all. Bots follow the "show on bots" setting. |
| RoleColorEverywhere | Partial | Role colors for user mentions in messages, for member list role headers, and the optional message tint with its intensity. The message box, voice user list, reactions list and poll results have no counterpart that could be colored reliably on 126.21, so those settings are left out. |
| IrcColors | Ported | Same hash as PC (XXH64 of the user id, `hsl(hash % 360, 100%, lightness)`), so users get the same color on both clients. Applies to author names, reply previews and (optionally) the member list, with the "only users without a color" and "only in DMs" options. |
| CustomUserColors | Partial | "Set Color" in the message long-press sheet opens the app's color picker for the author; its reset button removes the entry. Colors apply to author names, reply previews and the DM list, with the "in servers" option. Group DMs can't be colored from a message, and the user context menu doesn't exist on Android. Can't be on with IrcColors (conflict table). |
| UserMessagesPronouns | Ported | " • pronouns" after the timestamp, from profiles the app already loaded (opening a profile loads it), server pronouns first. Like PC it never fetches profiles itself. The Pronouns core plugin only shows them inside profiles, so the two don't overlap. Bots, system and AutoMod messages are skipped. |
| Timezones | Partial | "(time TZ)" after the timestamp for users with a known timezone, with all of PC's display options. Timezones come from the device (set with "Set Local Timezone" / "Delete Local Timezone" in the long-press sheet, region then place) and from the public timezone database (`/list` of the configured URL, loaded in the background, failures silent). Setting your own timezone on the database needs PC's OAuth sign-in to that site and is left out, as is the time in profiles. |
| PlatformIndicators | Partial | Desktop, mobile and web icons in the status color, before the timestamp and after names in the member list. Your own presence has no per-platform statuses on Android, so it shows the mobile icon. The profile badge location and the mobile status mask patch are left out. |
| MoreUserTags | Partial | Webhook, Owner, Admin, Staff, Mod, VC Mod and Chat Mod tags, computed from the server's roles and the channel's overwrites (cached 10 s), in Discord's own tag next to the name, with a switch per tag and the bot/webhook options. Android has room for one tag: webhooks get WEBHOOK instead of BOT, other bots keep BOT unless "Show extra tags in place of the BOT tag" is on. Custom tag texts and the member list are left out. "Replaces app for bot" doesn't apply: the legacy app already says BOT. |
| ForceOwnerCrown | Ported | The app hides the member list crown when a server has a hoisted admin role (`StoreChannelMembers.allowOwnerIndicator`); this always allows it. Applies to member lists loaded after enabling. |
| Streaks | Skipped | Needs OAuth authorization against a third-party streak service and its stored token; the legacy app's OAuth screen can't hand the code back to a plugin. |
| FriendshipRanks | Ported | The legacy app's relationships have no "friends since" date, so the plugin reads it once per start from Discord's relationships endpoint. The rank shows as a profile badge (tap it for the rank and its description, PC opens a modal), and the optional friend icon shows before the timestamp. Badge icons are loaded by the Badges core plugin, or by this plugin when that one is off. |
| LastActive | Ported | "User's Last Message" and "Your Last Message" in the message long-press sheet search the channel (or DM) with Discord's search and jump to the result. |
| LastOnline | Partial | Tracks presence changes and shows "5m ago" style text under a DM's name when the friend went offline less than a week ago and Discord shows nothing there (status, activity). Saved across restarts unless turned off, written in the background at most every two seconds. The server member list option is left out. |
| TypingTweaks | Partial | Role colors on the names in the typing indicator and the "A, B and N others are typing..." text for more than three typers. Avatars and tapping a name to open the profile are left out: the Android indicator is a single text line. |
