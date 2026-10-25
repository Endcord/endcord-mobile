# Batch 14: presence

Plugins about your status, custom status, rich presence and account settings.

The legacy app keeps one local presence (`StoreUserPresence`) and sends it with
`StoreGatewayConnection.presenceUpdate` whenever it changes. Its `updateActivity` keeps one activity per type, so
plugins using it would overwrite each other and Spotify. Instead, every plugin that adds or hides activities goes
through `com.endcord.plugins.presencecommon.PresenceHub`:

* Plugins hand the hub their activities (`setActivity`) or a filter (`setFilter`). One hook on `presenceUpdate`
  sends the app's own activities (custom status, Spotify), minus the filtered ones, plus every plugin's activities.
* Discord echoes your session's activities back and the app copies them into its local presence. The hub remembers
  the activities it added and drops their echoes, so an activity a plugin removed doesn't stick around. An identical
  resend within 3 seconds is dropped, so the echo can never loop.
* Resends are coalesced (1 s) and spaced at least 5 s apart, so no plugin can hit the gateway rate limit.
* `Activities` builds the app's `Activity` model (with the INSTANCE flag and button links), `AppAssets` resolves
  images like Discord's `ApplicationAssetUtils` (image links become `mp:external/...` through the application's
  external assets, other text is looked up in the application's uploaded assets), `Scrobblers` reads Last.fm and
  ListenBrainz, and `Poller` polls on its own background thread, only while Discord is in the foreground, and stops
  with the plugin.

The legacy `Activity` model has no `details_url`, `state_url`, `large_url`/`small_url` or `status_display_type`, so
clickable activity texts and the member list display type of newer clients can't be sent.

| Plugin | Status | Notes |
| --- | --- | --- |
| AlwaysTrust | Ported | `StoreMaskedLinks.isTrustedDomain` always says yes, so links open without the "Leaving Discord" popup. The Android app has no suspicious download popup, so there is nothing else to remove and no settings. |
| BetterActivities | Skipped | Needs activity icons in the member list rows and a carousel of all activities in the profile sheet, which renders a single activity on 126.21. Not done in this pass. |
| BetterSessions | Not applicable | The Android app has no sessions (devices) screen to enhance. |
| ClanSwitcher | Skipped | Changes your server tag every few seconds through a REST call with spoofed browser headers: automated API spam that works against Discord's rate limits and risks the account. The legacy app has no server tags either. |
| CustomIdle | Not applicable | The Android app never sets you idle on its own (there is no idle timer, idle is only a status you pick) and it sends no AFK state, so there is no timeout to change. |
| CustomRPC | Partial | Every setting is in the generated settings page: application ID and name, type, details, state, stream link, the four timestamp modes, images with their texts, two buttons and the party size. Images take a link (sent through the application's external assets) or the name of an uploaded asset. "Since discord open" counts from when the plugin started. Detail/state/image clickable URLs are left out (no such fields in the legacy model), as are the live preview and the Activity Sharing notice. |
| CustomStatusTimeouts | Partial | Extra radio buttons in the "Clear after" list of the custom status screen, from the seconds/minutes/hours/days settings plus PC's fixed 1-3 weeks and 2 and 4 months, sorted by duration with Forever first or last. Durations the app already has are not added twice. The app's expiry is an enum, so a picked extra duration replaces the expiry the screen computes when saving. Changes show the next time the screen opens. |
| DefaultStatusForever | Ported | The custom status screen preselects "Don't clear" instead of "Today" when it opens (Android uses radio buttons, not a dropdown). |
| Experiments | Partial | Shows Discord's own Developer options (experiment overrides) in settings, which the app only shows to staff. No DevTools, toolbar developer menu or experiment link embeds: the Android app has none of them. |
| IgnoreActivities | Partial | Filters every activity this device sends (Spotify and Endcord's presence plugins) by type and by the application ID list, in whitelist or blacklist mode, with "Import CustomRPC ID". Custom statuses are never filtered. The per-game toggles of the Registered Games and Activities tabs don't exist on Android, so the description says what the mobile version does. |
| LastFMRichPresence | Partial | Same options as PC except clickable links and the member list display type (not in the legacy model). Polls Last.fm every 20 seconds while Discord is in the foreground; the "hide with Spotify / any other presence" checks look at the app's own activities and other Endcord presence plugins. |
| MusicRichPresence | Partial | Last.fm, ListenBrainz and self-hosted ListenBrainz, with the same options as LastFMRichPresence plus the service name format. ListenBrainz cover art comes from the Cover Art Archive (release, then release group) with PC's YouTube thumbnail fallback; PC's MusicBrainz name search for tracks without MusicBrainz IDs is left out to keep requests low. |
| NoNitroUpsell | Not applicable | Endcord's core RemoveBilling plugin already removes the Nitro upsells for users without Nitro. Faking Nitro client-side isn't needed on Android and would only show Nitro options that then fail. |
| PlatformSpoofer | Ported | Changes only the `browser` property of the gateway identify (`GatewaySocket.doIdentify`), like PC. Login and REST requests keep the app's real properties, and if anything fails the app identifies normally, so it can't break signing in. Takes effect after a restart. Same warning as PC: this may get you warned or banned. |
| Questify | Not applicable | The legacy app has no Quests. |
| RichPresence | Skipped | Six separate service integrations (AudioBookShelf, osu! through the local tosu server, stats.fm, Jellyfin, Navidrome, Gensokyo Radio). osu! needs a desktop; the others could be built on `presencecommon` (PresenceHub and Poller) but weren't ported in this pass. |
| RPCEditor | Not applicable | Android has no Rich Presence from other apps (no RPC server, no game detection). The only activities are Spotify (which has no application ID to match) and Endcord's own presence plugins, which are configurable already. |
| SecretRingToneEnabler | Not applicable | The Android app ships a single call ringtone (`AppSound.SOUND_CALL_RINGING`); the secret versions are web client sounds. |
| ShowSongName | Ported | "Listening to Spotify" becomes "Listening to <song>" wherever the app writes the activity line (member list, DMs, profiles). |
| StatusPresets | Partial | "Keep" and "Status Presets" buttons under "Clear after" on the custom status screen: Keep saves the text, emoji and clear-after choice, Status Presets lists them, applies one directly and closes the screen, or deletes one. Android has no status menu submenu, so the presets live on the custom status screen. A preset saved with a CustomStatusTimeouts duration keeps 30 minutes. Custom emoji still need Nitro, Discord rejects them otherwise. |
| SteamStatusSync | Not applicable | Changes your Steam status by opening `steam://friends/status/...`, which only the desktop Steam client handles. |
| Summaries | Not applicable | The legacy app has no conversation summaries feature or UI. |
| UnlimitedAccounts | Not applicable | The legacy app has no account switcher. |
| Wellbeing | Partial | The dashboard is a dialog from the settings page: today's time (counted per minute while Discord is in the foreground), messages sent today and the last 7 days, with the daily goal note. Break reminders are a toast; "Break · 15 min" / "30 min" set Do Not Disturb and restore your status afterwards (in memory, like PC). Messages are counted from this device's chat input, PC counts every message of yours it sees. Kept 14 days, stored locally. |
