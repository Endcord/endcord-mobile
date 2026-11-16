/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * BypassStatus's decisions, apart from Discord so they can be tested: whose messages get through your status, and
 * what the pop-up says.
 */

const SNOWFLAKE = /^\d{15,21}$/;

// Discord's message flag for @silent messages (SUPPRESS_NOTIFICATIONS)
const SILENT = 1 << 12;

// The longest list read and the longest message read for a pop-up: other people's messages are capped before the
// mention replacements run, and the lists are what the user typed
const MAX_LIST = 20_000;
const MAX_CONTENT = 2000;

/** The IDs in a list like PC's setting, "1, 2, 3" */
export function idSet(list: string): Set<string> {
    return new Set(String(list ?? "").slice(0, MAX_LIST).split(/[\s,]+/).filter(id => SNOWFLAKE.test(id)));
}

/** The list with the ID added, or taken out when it was there, written as PC writes it */
export function toggleId(list: string, id: string): { list: string; added: boolean; } {
    const ids = [...idSet(list)];
    const has = ids.includes(id);
    const next = has ? ids.filter(x => x !== id) : SNOWFLAKE.test(id) ? [...ids, id] : ids;
    return { list: next.join(", "), added: !has && next.length > ids.length };
}

export interface MentionContext {
    me: string;
    /** Your roles in the message's server */
    myRoles: string[];
    /** Your notification settings for that server */
    suppressEveryone?: boolean;
    suppressRoles?: boolean;
}

/** Whether a message pings you, as Discord decides it for its own notifications */
export function isMentioned(message: any, ctx: MentionContext): boolean {
    if (!message || typeof message !== "object") return false;
    if (typeof message.mentioned === "boolean" && message.mentioned) return true;
    const mentions: any[] = Array.isArray(message.mentions) ? message.mentions : [];
    if (mentions.some(u => (u?.id ?? u) === ctx.me)) return true;
    if (message.mention_everyone && !ctx.suppressEveryone) return true;
    if (ctx.suppressRoles || !Array.isArray(message.mention_roles)) return false;
    return message.mention_roles.some((id: unknown) => typeof id === "string" && ctx.myRoles.includes(id));
}

export interface BypassInput {
    message: any;
    channel?: { id?: string; type?: number; guild_id?: string | null; recipients?: string[]; } | null;
    guildId?: string | null;
    /** Your status now, and the one the bypasses are for */
    status?: string;
    statusToUse: string;
    /** The channel you're looking at, while Discord is on screen */
    viewingChannelId?: string;
    lists: { guilds: Set<string>; channels: Set<string>; users: Set<string>; };
    allowOutsideOfDms: boolean;
    respectSilentPings: boolean;
    mention: MentionContext;
}

/** Whether a message gets through your status, as on PC */
export function shouldBypass(input: BypassInput): boolean {
    const { message, channel } = input;
    if (!message || typeof message !== "object" || message.state === "SENDING") return false;
    const authorId = message.author?.id;
    if (typeof authorId !== "string" || authorId === input.mention.me) return false;
    // As on PC, messages with no text (only a picture, say) don't pop up
    if (typeof message.content !== "string" || message.content === "") return false;
    if (!input.status || input.status !== input.statusToUse) return false;
    if (message.channel_id === input.viewingChannelId) return false;
    if (input.respectSilentPings && (Number(message.flags) & SILENT)) return false;

    const mentioned = isMentioned(message, input.mention);
    const guildId = input.guildId ?? channel?.guild_id ?? undefined;
    if (mentioned && (guildId && input.lists.guilds.has(guildId) || input.lists.channels.has(message.channel_id))) return true;
    if (!input.lists.users.has(authorId)) return false;
    // Their DM with you: a one-to-one channel with them in it
    const theirDm = channel?.type === 1 && (!Array.isArray(channel.recipients) || channel.recipients.includes(authorId));
    return theirDm || mentioned && input.allowOutsideOfDms;
}

export interface Names {
    user(id: string): string | undefined;
    channel(id: string): string | undefined;
    role(id: string): string | undefined;
}

/** A message's text for a pop-up: mentions as names, on one line, no longer than `length` */
export function popupText(content: string, names: Names, length = 90): string {
    const text = String(content ?? "").slice(0, MAX_CONTENT)
        .replace(/<@!?(\d{15,21})>/g, (_, id) => `@${names.user(id) ?? "?"}`)
        .replace(/<@&(\d{15,21})>/g, (_, id) => `@${names.role(id) ?? "?"}`)
        .replace(/<#(\d{15,21})>/g, (_, id) => `#${names.channel(id) ?? "?"}`)
        .replace(/<a?:(\w{1,32}):\d{15,21}>/g, ":$1:")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
