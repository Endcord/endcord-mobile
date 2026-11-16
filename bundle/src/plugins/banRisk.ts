/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's list of plugins whose work Discord can see and punish (src/utils/banRisk.ts there), for the ones Endcord
 * for Android has: acting on the account by themselves, sending many requests in a row, or telling Discord's servers
 * something that isn't true. Plugins that only change what you see aren't here. The card says so, and turning one on
 * asks first. English text, translated where it's shown.
 */

import { tx } from "@core/i18n";

/** By plugin name, as Endcord PC names them */
export const BAN_RISK: Readonly<Record<string, string>> = {
    AutoReact: tx("It reacts to messages by itself."),
    ScheduledMessages: tx("It sends messages by itself at the time you set."),
    SelfDestruct: tx("It deletes your messages by itself after a delay."),
    AntiDeleteMessage: tx("It sends your messages again by itself when someone deletes them."),
    AntiNickname: tx("It changes your nickname back by itself."),
    AutoDisconnectAndAutoMute: tx("It disconnects and mutes people by itself, again and again."),
    FollowUser: tx("It joins voice channels by itself."),
    WaitForSlot: tx("It joins voice channels by itself."),
    PullUserIntoVoice: tx("It moves someone into your voice channel again and again."),
    ClearMyMessages: tx("It deletes many messages in a row."),
    ExportDM: tx("It loads a whole conversation's history in one go."),
    MutualServerMembers: tx("It asks Discord for whole member lists."),
    SplitLargeMessages: tx("It sends several messages in a row."),
    FileSplitter: tx("It sends several messages in a row."),
    SpotifyLyricsStatus: tx("It changes your status every few seconds."),
    FakeMute: tx("It tells Discord's servers you're muted or deafened when you aren't."),
    ClanSwitcher: tx("It changes your server tag by itself, again and again."),
    SilentDelete: tx("It edits and deletes many of your messages in a row."),
    VoiceChatUtilities: tx("It moves, mutes or disconnects a whole voice channel at once."),
};

export const BAN_RISK_LEAD = tx("Discord can suspend accounts for this.");

/** Why turning a built-in plugin on can get the account suspended, or undefined when it can't */
export const banRiskOf = (plugin: { name: string; endcord?: boolean; }) =>
    plugin.endcord && Object.prototype.hasOwnProperty.call(BAN_RISK, plugin.name) ? BAN_RISK[plugin.name] : undefined;
