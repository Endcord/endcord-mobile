# Batch 15: voice

Plugins for voice channels and calls. The legacy app has no user panel, chat bar buttons or context menus, so the
ports use the places Android does have. Shared helpers live in `com.endcord.plugins.voicecommon`:

* `VoiceEvents`: the one hook on gateway voice state updates (`StoreVoiceStates.handleVoiceStateUpdate`) for every
  plugin that reacts to joins, leaves, moves, mute, camera or screenshare changes. Each listener gets the state
  before and after the update, on the store thread.
* `Voice`: store lookups (your channel, who is in a channel, permissions, names, DMs) and joining or leaving the way
  the app does, so Discord's own checks for permissions and full channels apply.
* `CallSettingsEntries`: switches and buttons in the call settings sheet (the gear of the full screen call,
  `WidgetVoiceSettingsBottomSheet`), after Discord's own switches. This is where PC's user panel buttons went.
* `CallIndicator`: extra text after "Voice Connected: …" in the bar at the top of the app while you are in a call,
  refreshed every second when a provider needs it (timer). Fake states and following show there, so they are always
  visible.
* `FakeVoiceState`: the fake mute and deafen flags. Only the voice state sent over the gateway is changed; the
  microphone and speaker keep their real state. Flags are kept in memory only.
* `Sounds`: Discord's own call sounds and the phone's notification sound, instead of PC's downloaded mp3 files.

| Plugin | Status | Notes |
| --- | --- | --- |
| CallTimer | Partial | The timer is shown after "Voice Connected: …" in the call bar at the top of the app (Android has no RTC panel), with PC's two formats. It restarts when you change channels, like PC. If the plugin is turned on during a call, it counts from that moment because the join time isn't known. |
| DisableCallIdle | Not applicable | The legacy app has no idle timer for DM calls and never moves you to the AFK channel on its own, so there is nothing to turn off. |
| DisableCameras | Not applicable | The legacy app always joins calls with your camera off and doesn't turn it back on when it reconnects. |
| FakeDeafen | Ported | "Fake deafen" switch in the call settings sheet, plus a toggle on the plugin's settings page (PC uses user panel and chat bar buttons). The voice state the app sends says deafened, and muted as with a real deafen. Your speaker and microphone keep working, and the state is sent again right away when you toggle it. While on, the call bar shows "Fake deafened" and a toast explains it. Kept in memory only: restarting, or turning the plugin off, sends your real state again. |
| FakeMute | Ported | Same as FakeDeafen, for mute: the "Fake mute" switch, "Fake muted" in the call bar, and the real state comes back when the plugin is off. The description says where the toggle is on mobile. |
| FollowUser | Ported | "Follow User" and "Unfollow User" in the user profile sheet (PC: user context menu), with all of PC's settings. PC's header bar indicator becomes "Following name" in the call bar. "Join followed user" (PC: click the indicator) and "Stop following" (PC: right click it) are on the settings page. Joins use the app's own checks, so full or forbidden channels show a toast. |
| FollowVoiceUser | Skipped | Same feature as FollowUser, limited to friends and with fewer options. Two follow plugins would pull you into different channels. Use FollowUser. |
| VoiceRejoin | Ported | Remembers the channel this client is in and rejoins it on the first gateway connection after the app starts, with PC's delay, timeout, "call ended" and DMs only options. The saved time is refreshed every 15 seconds during a call, so an app that Android killed mid-call still counts as just disconnected. Each save is a single write, off the main thread. Later reconnects in the same session are left to the app. |
| WaitForSlot | Partial | When the app refuses to join a full channel, a dialog offers to wait for a slot. Trying again while waiting offers "Leave Queue", which is also on the settings page. When a slot opens, the phone's notification sound plays (PC downloads an mp3) and a Join dialog appears, or with "autoJoin" you join right away. PC's "Join Queue" channel menu entry is left out: long pressing a voice channel opens its settings on Android. Like PC, channels where you can move members are skipped. |
| AutoDisconnectAndAutoMute | Skipped | It disconnects or mutes chosen people automatically, in the background, whenever they join. Endcord only acts on other people through an explicit action each time, see VoiceChatUtilities. |
| VoiceJoinMessages | Ported | Ephemeral Clyde messages in the friend's DM when they join a voice channel you can see, with PC's member list, member count, "even in the same channel", allow, ignore and blocked user options. The "silent" option is left out because local messages never notify anyway. The author is Clyde rather than the friend. Like PC, a DM the app hasn't loaded yet may drop the message once it loads. |
| VcNarrator | Ported | Uses Android's TextToSpeech in the user's Endcord language, and falls back to the phone's language when there is no voice for it. Volume and speed are percentages, with the same messages and placeholders as PC, plus your own mute and deafen. Messages still at their default are spoken translated, and an empty message says nothing. The voice is picked in the phone's text to speech settings. Stage channels are skipped, like PC. |
| VoiceChannelLog | Partial | Logs joins, leaves, moves, server mute and deafen, camera and screenshare in your current channel, in memory (500 entries). "View Voice Channel Logs" in the call settings sheet lists them with times, newest first. "Clear logs" is on the settings page. Soundboard and activity logging are left out because the legacy app has neither. There is no header button or channel menu entry. |
| UserVoiceShow | Partial | Adds "Join Voice Channel" to the profile sheet of users who are in a voice channel you can see, optionally including DM calls. PC's speaker icons in the member list, DM list and profile aren't added. |
| VoiceCount | Partial | The number of people is shown after the name of voice channels without a user limit, with PC's "hide on empty channels" option. Channels with a limit keep Discord's own count/limit pill, so PC's "show user limit" option is left out. |
| VoiceButtons | Not applicable | Tapping someone in an Android call opens their profile sheet, which already has message, local mute, volume and, with the permission, server mute and deafen. |
| VoiceChatUtilities | Partial | "Voice Tools" in the call settings sheet of the server call you are in: disconnect, mute, unmute, deafen, undeafen or move everyone. Each action is shown only if you have the permission it needs, and each use is confirmed in a dialog. Requests run one after another with PC's rate limit settings. "Mention all users" copies the mentions to the clipboard instead of typing them. Channels you aren't in can't be reached, since there is no channel menu. |
| UniversalVolume | Ported | Sets everyone in your channel to the target volume (0 to 200%) through the app's per user volume, and keeps new people at that level. Changing the setting applies it to everyone again. |
| VolumeBooster | Partial | The user volume slider in profiles goes up to 300, 400 or 500% (1.5× to 2.5×, PC goes up to 5×). Volumes are capped at 500% as a safe maximum, and any volume above 200% goes back to 200% when the plugin is turned off. Stream volume isn't boosted. The description says "user volume" only. |
| NoPushToTalk | Ported | The app's "can use voice activity" check always passes, so channels that require push to talk no longer force mute people on voice activity. Turning the plugin off gives the current channel its real rule back. |
| AntiMoveDeco | Ported | "Prevent being moved or disconnected" switch in the call settings sheet (PC: user panel button), and "Protected" in the call bar. It rejoins 500 ms after you are moved or disconnected, including when the voice connection is closed on you. Unlike PC, leaving or switching channels yourself turns the protection off or moves it, instead of pulling you back. It gives up after repeated failures. |
| WebcamStartNotifier | Ported | Plays Discord's own stream start and stop sounds (PC downloads two mp3 files) when someone in your channel turns their camera on or off, with the DM and server options. |
| ExitSounds | Not applicable | The legacy app has no soundboard. |
| VoiceDownload | Not applicable | The legacy app shows voice messages as regular audio attachments, which already have a download button. |
| VoiceServerInfo | Not applicable | It needs desktop native code for the voice relay's address, location and ping. |
| VoiceStats | Skipped | It needs per user time tracking stored across restarts and a read only stats row in profiles. The legacy profile sheet has no place for that, so it isn't ported in this batch. |
| VoiceFakeDetector | Partial | Uses the app's speaking events. Someone in your channel who is self muted or deafened (not server muted or suppressed) and still talks, 1.5 seconds after their last change, gets one toast per call. The mark clears when they leave or really unmute. Fake camera detection and the marker in the voice user list are left out, as the description says. |
| RandomVoice | Skipped | A large PC UI (filters, user panel button) for a feature of little use on mobile. Not ported in this batch. |
| StatusWhileActive | Skipped | Endcord PC ships it for the desktop app only. On Android, changing your status goes through the status sheet's view model, which wasn't ported in this batch. |
| GameActivityToggle | Not applicable | The legacy app doesn't detect games on Android, and the user panel button it adds doesn't exist. |
| SpotifyActivityToggle | Skipped | The Android app sets your Spotify activity from Spotify's own playback broadcasts. A toggle needs a place in the UI (PC: user panel button) and wasn't ported in this batch. |
| MediaPlaybackSpeed | Skipped | Media embeds play in the legacy app's own inline player. Changing its speed needs patching that player, which wasn't done in this batch. |
| VoiceMessagesInBackground | Not applicable | The legacy app has no voice message player. Voice messages are plain audio attachments. |
| VoiceMessages | Skipped | The legacy app's upload path can't send a proper voice message. It has no voice message flag, waveform or duration for attachments, and it only uploads files the user picks. |
