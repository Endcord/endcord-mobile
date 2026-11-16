/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * OnePingPerDM's choice, apart from Discord so it can be tested: whether a message's sound plays.
 */

// Discord's channel types
const DM = 1, GROUP_DM = 3;

export interface PingSettings {
    channelToAffect: string;
    allowMentions: boolean;
    allowEveryone: boolean;
}

/**
 * Whether a message gets its sound, as on PC: always outside the kinds of DM chosen, and for @mentions and @everyone
 * when allowed; otherwise only the first unread message of the DM does. `oldestUnreadId` is Discord's oldest unread
 * message there, which is nothing or this message itself when nothing else was unread.
 */
export function playsSound(message: any, channelType: number | undefined, settings: PingSettings, me: string | undefined, oldestUnreadId: string | null | undefined): boolean {
    if (!message || typeof message !== "object") return true;
    if (channelType !== DM && channelType !== GROUP_DM) return true;
    if (channelType === DM && settings.channelToAffect === "group_dm") return true;
    if (channelType === GROUP_DM && settings.channelToAffect === "user_dm") return true;
    const mentions: any[] = Array.isArray(message.mentions) ? message.mentions : [];
    if (settings.allowMentions && me && mentions.some(m => (m?.id ?? m) === me)) return true;
    if (settings.allowEveryone && message.mention_everyone) return true;
    return oldestUnreadId == null || oldestUnreadId === message.id;
}

/** The message a call to Discord's sound function is about, when it was handed one */
export function messageIn(args: unknown[]): any {
    for (const arg of args) {
        if (!arg || typeof arg !== "object") continue;
        const value = arg as any;
        if (typeof value.channel_id === "string" && typeof value.id === "string") return value;
        if (typeof value.message?.channel_id === "string" && typeof value.message?.id === "string") return value.message;
    }
    return undefined;
}
