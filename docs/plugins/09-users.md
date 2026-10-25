# Batch 09: users

Ports of Endcord PC's profile, friends, roles and member plugins. On mobile the profile popout is the user
profile sheet (`WidgetUserSheet`), so plugins that add buttons to profiles add entries to it through
`com.endcord.plugins.api.UserSheetActions` and show their content in a dialog. Role chips in the sheet get
tap and long-press handlers through a small shared helper, `com.endcord.plugins.userscommon.RoleChips`, so
ClickableRoles and BetterRoleContext can both be on. Plugins that load third-party data (ReviewDB,
GitHubRepos, GlobalBadges, USRBG, UserPFP) fetch it in the background, cache it in memory, fail silently and
send nothing but what Endcord PC sends (a user or GitHub id in the URL, or nothing at all).

| Plugin | Status | Notes |
| --- | --- | --- |
| AlwaysExpandProfiles | Ported | The mobile profile is a bottom sheet that opens halfway; this opens it fully expanded once its content has loaded. It can still be dragged down. |
| AlwaysExpandRoles | Not applicable | The mobile profile sheet already lists every role; there is no collapsed role list. |
| BannersEverywhere | Not applicable | The Android member list rows have no room for banners and the app doesn't load banners for list members, only when a profile is opened. |
| BetterBlockedUsers | Partial | Adds a search field to Settings > Blocked users that filters by username, display name or id. Names already open the profile when tapped, so the "selectable names" and profile button parts don't apply. |
| BetterRoleContext | Partial | Long-press a role chip in a profile: Edit Role (if you can manage roles), Copy Role Color, View Role Icon (in the chosen file format), Copy Role ID. The member list's role headers aren't hooked. Developer mode isn't needed. |
| BetterRoleDot | Not applicable | The Android app has no RoleDot accessibility setting; role chips always show a colored dot. Copying a role's color is in BetterRoleContext. |
| CancelFriendRequest | Ported | "Cancel Outgoing Friend Request" entry in the profile sheet while your request is pending. |
| CancelFriendRequestNC | Ported | Tapping the profile sheet's pending friend request button again cancels the request. The DM header button of PC doesn't exist on mobile. |
| ClickableRoles | Partial | Tap a role chip in a profile to list the members with it (Discord's role member ids, cached for a minute; members the app doesn't know are requested from the gateway). Tap a member to open their profile. The member list's role headers aren't hooked. |
| FakeConnections | Skipped | Not ported in this pass: it needs a settings editor for connection entries and has to fake the connections view's data; low value on mobile. |
| FakeFriends | Skipped | Simulating relationships means injecting fake entries into the relationship, user and presence stores that the friends list, DMs and notifications all read; too invasive to do safely. |
| FakeNitroAge | Skipped | Nitro tenure badges come from the profile badges the server sends, with Discord's own tier icons; faking them would mean rebuilding those badges by hand. |
| FakeTag | Skipped | Mobile guild tags are drawn from a real server's badge on Discord's CDN, so PC's custom badge images can't be shown; a tag without a badge isn't displayed. |
| FriendCodes | Skipped | Duplicate on mobile: FriendInvites (batch 02) already creates, lists and revokes friend invite links with `/friendinvites`. |
| FriendTags | Not applicable | Depends on the desktop quick switcher's search syntax; the Android quick switcher has nothing to hook a tag filter into. |
| GitHubRepos | Ported | "GitHub Repositories" entry in profiles with a GitHub connection: lists the public repositories (most stars first, optional stars and language) and opens one in the browser. Uses the same GitHub API requests as PC. |
| GlobalBadges | Ported | Adds the badges from the GlobalBadges API to the profile header, with the same per-mod switches, prefix/suffix and API URL. Aliucord badges are skipped while the built-in Badges plugin is on, since it already shows them. Refreshed every 30 minutes and from the settings page. |
| ImplicitRelationships | Not applicable | Needs a new section in the friends list fed by the affinities API; the Android friends list has a fixed set of sections. |
| IRememberYou | Skipped | Not ported in this pass. |
| MutualGroupDMs | Ported | "Mutual Groups" entry in the profile sheet when you share group DMs with the user; lists them with their member count and opens one when tapped. |
| MutualServerMembers | Partial | `/mutualmembers server [other]` compares two servers by id or name (the second defaults to the current server) and lists up to 50 shared members. Like PC it only compares members the app has loaded. There is no server context menu or dropdown UI on mobile. |
| PermissionsViewer | Partial | "View Permissions" entry in profiles opened in a server: the member's server permissions with the roles granting each, owner/administrator shortcuts, and what the channel you opened the profile from allows or denies on top. Permission names use the app's own translations. Viewing a channel's or a server's role permissions on their own isn't available. |
| ProfileSets | Skipped | Saving and applying profile presets edits your real profile through the API and needs a large editor UI; not ported in this pass. |
| ReviewDB | Partial | Read only: "View Reviews" in profiles lists the user's ReviewDB reviews (warning, timestamps and blocked-user filtering settings work). Writing, voting, reporting and blocking need ReviewDB's OAuth login, which isn't available. |
| ShowConnections | Not applicable | The mobile profile sheet already shows connected accounts. |
| ShowTimeoutDuration | Ported | Where the app shows the timeout icon next to a name (moderators), the remaining time is shown after the timestamp, or only in a toast when the icon is tapped. Also a "Show Timeout Duration" entry in the profile sheet. The time updates when the row is redrawn, not every second. |
| SortFriendRequests | Not applicable | The Android app's relationship model doesn't keep when a request was received, so there is nothing to sort by. |
| UserPFP | Ported | Replaces avatars (and server avatars, optional) with the UserPFP database's; "Nitro" preference keeps animated Nitro avatars. "Set Avatar" in the profile sheet sets a local-only avatar URL. Animated GIFs play only where the app animates avatars. |
| USRBG | Partial | Shows USRBG banners in profile sheets, with the Nitro-first setting. Voice chat backgrounds don't apply: the Android call screen has no background images. Server profile banners always take priority. |
