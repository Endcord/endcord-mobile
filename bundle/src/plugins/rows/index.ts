/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins that add to how messages are drawn. Discord's chat is native, so these change the row Discord builds for
 * it: the text after the time, the name, colors and the content's text nodes.
 */

import { t, tx } from "@core/i18n";
import formatDate from "@lib/utils/formatDate";
import moment from "moment";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import { appendToTimestamp, nativeColor, onMessageRow, RowOrder, snowflakeTime } from "../hooks";

/** Puts text before the time, which sits right after the name */
function prependToTimestamp(row: any, text: string) {
    if (typeof row.timestamp === "string" && text && !row.timestamp.startsWith(text)) row.timestamp = `${text}${row.timestamp}`;
}

const timeOf = (message: any): number => {
    const ts = message.timestamp;
    if (typeof ts?.valueOf === "function" && typeof ts.valueOf() === "number") return ts.valueOf();
    return Date.parse(ts) || snowflakeTime(message.id);
};

/**
 * A function of a setting's text, worked out again only when the text changes; row decorators run for every message
 * drawn, so they don't parse their settings each time
 */
function cached<T>(fn: (text: string) => T): (text: string) => T {
    let key: string | undefined;
    let value: T;
    return text => {
        if (text !== key) {
            key = text;
            value = fn(text);
        }
        return value;
    };
}

/** "userId = value" lines, as a map */
function lines(text: string) {
    const map = new Map<string, string>();
    for (const line of text.split("\n")) {
        const index = line.indexOf("=");
        if (index > 0) map.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
    }
    return map;
}

const MessageLatency = definePlugin({
    id: "endcord.message-latency",
    name: "MessageLatency",
    description: tx("Displays an indicator for messages that took ≥n seconds to send"),
    authors: [ENDCORD_AUTHOR],
    icon: "TimerIcon",
    tags: ["Chat", "Utility"],
    settings: {
        latency: { type: "number", label: tx("Threshold (seconds)"), description: tx("Threshold in seconds for latency indicator"), default: 2, min: 0, max: 60 },
        showMillis: { type: "boolean", label: tx("Show milliseconds"), description: tx("Show milliseconds"), default: false },
        ignoreSelf: { type: "boolean", label: tx("Not on my messages"), description: tx("Don't add indicator to your own messages"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("message-latency", (row, message) => {
            const nonce = String(message.nonce ?? "");
            if (!/^\d{17,20}$/.test(nonce) || store.ignoreSelf && message.author?.id === currentUserId()) return;
            const delta = snowflakeTime(message.id) - snowflakeTime(nonce);
            // Clients that make nonces another way give nonsense; Discord drops anything over a few minutes old
            if (delta < store.latency * 1000 || delta > 600_000) return;
            const seconds = delta / 1000;
            appendToTimestamp(row, ` · ⏱ ${store.showMillis ? seconds.toFixed(3) : seconds.toFixed(1)}s`);
        }));
    },
});

const PinIcon = definePlugin({
    id: "endcord.pin-icon",
    name: "PinIcon",
    description: tx("Adds a pin icon to pinned messages"),
    authors: [ENDCORD_AUTHOR],
    icon: "PinIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("pin-icon", (row, message) => {
            if (message.pinned) appendToTimestamp(row, " · 📌");
        }));
    },
});

const WordCount = definePlugin({
    id: "endcord.word-count",
    name: "WordCount",
    description: tx("Shows the word count of messages next to their time"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        minimum: { type: "number", label: tx("Shortest message"), description: tx("Only count messages with at least this many words"), default: 1, min: 1, max: 1000 },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("word-count", (row, message) => {
            const words = String(message.content ?? "").trim().split(/\s+/).filter(Boolean).length;
            if (words >= store.minimum) appendToTimestamp(row, ` · ${words === 1 ? t("1 word") : t("{count} words", { count: words })}`);
        }));
    },
});

const RealtimeTimestamps = definePlugin({
    id: "endcord.realtime-timestamps",
    name: "RealtimeTimestamps",
    description: tx("Shows the seconds in every message's time (e.g. 15:34:21)"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Chat", "Appearance"],
    start({ cleanup }) {
        cleanup(onMessageRow("realtime-timestamps", (row, message) => {
            if (typeof row.timestamp !== "string") return;
            const withSeconds = formatDate(timeOf(message), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            row.timestamp = row.timestamp.replace(/\d{1,2}[:.]\d{2}(?:\s?[AaPp]\.?[Mm]\.?)?/, withSeconds);
        }, RowOrder.ADJUST));
    },
});

const CustomTimestamps = definePlugin({
    id: "endcord.custom-timestamps",
    name: "CustomTimestamps",
    description: tx("Shows message times in a format you choose"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Chat", "Customisation"],
    settings: {
        format: {
            type: "string",
            label: tx("Format"),
            description: tx("Moment.js format, like HH:mm:ss, DD/MM/YYYY HH:mm or [Today at] LT"),
            placeholder: "DD/MM/YYYY HH:mm",
            default: "DD/MM/YYYY HH:mm",
        },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("custom-timestamps", (row, message) => {
            if (typeof row.timestamp !== "string" || !store.format.trim()) return;
            try {
                // From the time itself: Discord's message records have had it as a moment, and now have a Date
                row.timestamp = moment(timeOf(message)).format(store.format);
            } catch {
                // An invalid format leaves Discord's time
            }
        }, RowOrder.REPLACE));
    },
});

const Timezones = definePlugin({
    id: "endcord.timezones",
    name: "Timezones",
    description: tx("Shows the local time of the users you choose next to their messages"),
    authors: [ENDCORD_AUTHOR],
    icon: "GlobeEarthIcon",
    tags: ["Utility"],
    settings: {
        timezones: {
            type: "string",
            label: tx("Users' time zones"),
            description: tx("One per line: user ID = time zone, like 123456789012345678 = Europe/Istanbul"),
            placeholder: "123456789012345678 = Europe/Istanbul",
            multiline: true,
            default: "",
        },
        twentyFourHourFormat: { type: "boolean", label: tx("24-hour clock"), description: tx("Show time in 24h format"), default: true },
        showTimezoneInfo: { type: "boolean", label: tx("Show the time zone"), description: tx("Show timezone info next to time"), default: false },
    },
    start({ store, cleanup }) {
        const zones = cached(lines);
        cleanup(onMessageRow("timezones", (row, message) => {
            const zone = zones(store.timezones).get(message.author?.id);
            if (!zone) return;
            try {
                const local = formatDate(timeOf(message), { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: !store.twentyFourHourFormat });
                appendToTimestamp(row, ` · 🕒 ${local}${store.showTimezoneInfo ? ` (${zone})` : ""}`);
            } catch {
                // Unknown time zone
            }
        }));
    },
});

const UserMessagesPronouns = definePlugin({
    id: "endcord.user-messages-pronouns",
    name: "UserMessagesPronouns",
    description: tx("Shows people's pronouns from their Discord profile next to their messages"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        showSelf: { type: "boolean", label: tx("On my messages too"), description: tx("Enable or disable showing pronouns for yourself"), default: true },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("pronouns", (row, message) => {
            const userId = message.author?.id;
            if (!userId || !store.showSelf && userId === currentUserId()) return;
            const profiles = getStore("UserProfileStore");
            const guildId = getStore("ChannelStore")?.getChannel?.(message.channel_id)?.guild_id;
            const pronouns = (guildId && profiles?.getGuildMemberProfile?.(userId, guildId)?.pronouns) || profiles?.getUserProfile?.(userId)?.pronouns;
            if (pronouns) prependToTimestamp(row, `${pronouns} · `);
        }));
    },
});

const ShowMeYourName = definePlugin({
    id: "endcord.show-me-your-name",
    name: "ShowMeYourName",
    description: tx("Display usernames next to nicks, or no nicks at all"),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Chat"],
    settings: {
        mode: {
            type: "select",
            label: tx("How to display usernames and nicks"),
            default: "nick-user",
            options: [
                { label: tx("Nickname (username)"), value: "nick-user" },
                { label: tx("Username (nickname)"), value: "user-nick" },
                { label: tx("Username only"), value: "user" },
            ],
        },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("show-me-your-name", (row, message) => {
            const username = message.author?.username;
            if (typeof row.username !== "string" || !username || row.username === username) return;
            const nick = row.username;
            row.username = store.mode === "user" ? username : store.mode === "user-nick" ? `${username} (${nick})` : `${nick} (${username})`;
        }, RowOrder.ADJUST));
    },
});

/** A steady color for each user, like IRC clients */
function ircColor(id: string, lightness: number) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 70%, ${lightness}%)`;
}

function setNameColor(row: any, color: string) {
    const native = nativeColor(color);
    if (native === undefined) return;
    // Discord has named this differently between versions
    if ("usernameColor" in row || !("colorString" in row)) row.usernameColor = native;
    if ("colorString" in row) row.colorString = color;
    if ("roleColor" in row) row.roleColor = native;
}

const IrcColors = definePlugin({
    id: "endcord.irc-colors",
    name: "IrcColors",
    description: tx("Makes username colors in chat unique, like in IRC clients"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaintPaletteIcon",
    tags: ["Appearance", "Chat"],
    settings: {
        lightness: { type: "number", label: tx("Lightness"), description: tx("Lightness of the colors, from 20 (dark) to 90 (light)"), default: 70, min: 20, max: 90 },
        memberColorsOnly: { type: "boolean", label: tx("Only people without a role color"), description: tx("Keep role colors and only color names that would be the default color"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("irc-colors", (row, message) => {
            const id = message.author?.id;
            if (!id) return;
            if (store.memberColorsOnly && (row.colorString || row.roleColor)) return;
            setNameColor(row, ircColor(id, store.lightness));
        }));
    },
});

const CustomUserColors = definePlugin({
    id: "endcord.custom-user-colors",
    name: "CustomUserColors",
    description: tx("Give any user a custom name color in chat"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaintPaletteIcon",
    tags: ["Appearance", "Customisation"],
    settings: {
        colors: {
            type: "string",
            label: tx("Colors"),
            description: tx("One per line: user ID = color, like 123456789012345678 = #ff66aa"),
            placeholder: "123456789012345678 = #ff66aa",
            multiline: true,
            default: "",
        },
    },
    start({ store, cleanup }) {
        const colors = cached(lines);
        cleanup(onMessageRow("custom-user-colors", (row, message) => {
            const color = colors(store.colors).get(message.author?.id);
            if (color) setNameColor(row, color);
        }, RowOrder.OVERRIDE));
    },
});

function highestRole(guildId: string, userId: string) {
    const member = getStore("GuildMemberStore")?.getMember?.(guildId, userId);
    const roles = getStore("GuildRoleStore")?.getRoles?.(guildId) ?? getStore("GuildStore")?.getGuild?.(guildId)?.roles ?? {};
    return (member?.roles ?? [])
        .map((id: string) => roles[id])
        .filter((r: any) => r && !r.managed)
        .sort((a: any, b: any) => b.position - a.position)[0];
}

const ShowRolesInChat = definePlugin({
    id: "endcord.show-roles-in-chat",
    name: "ShowRolesInChat",
    description: tx("Shows a user's highest role next to their name in chat messages"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Chat", "Servers"],
    settings: {
        showBots: { type: "boolean", label: tx("Bots too"), description: tx("Whether to show the highest role on bots."), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("show-roles-in-chat", (row, message) => {
            const guildId = getStore("ChannelStore")?.getChannel?.(message.channel_id)?.guild_id;
            if (!guildId || !message.author?.id || !store.showBots && message.author.bot) return;
            const role = highestRole(guildId, message.author.id);
            if (role?.name) prependToTimestamp(row, `${role.name} · `);
        }));
    },
});

const SilentEdit = definePlugin({
    id: "endcord.silent-edit",
    name: "SilentEdit",
    description: tx("Hides the '(edited)' label on your own edited messages. The message stays — nothing is deleted or resent."),
    authors: [ENDCORD_AUTHOR],
    icon: "PencilIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("silent-edit", (row, message) => {
            if (message.author?.id === currentUserId() && row.edited) row.edited = undefined;
        }));
    },
});

const ShowTimeoutDuration = definePlugin({
    id: "endcord.show-timeout-duration",
    name: "ShowTimeoutDuration",
    description: tx("Shows how much longer a user's timeout will last next to their messages"),
    authors: [ENDCORD_AUTHOR],
    icon: "TimerIcon",
    tags: ["Servers", "Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("show-timeout-duration", (row, message) => {
            const guildId = getStore("ChannelStore")?.getChannel?.(message.channel_id)?.guild_id;
            if (!guildId || !message.author?.id) return;
            const until = Date.parse(getStore("GuildMemberStore")?.getMember?.(guildId, message.author.id)?.communicationDisabledUntil ?? "");
            const left = until - Date.now();
            if (!(left > 0)) return;
            const minutes = Math.ceil(left / 60_000);
            const text = minutes >= 1440 ? t("{count}d", { count: Math.round(minutes / 1440) }) : minutes >= 60 ? t("{count}h", { count: Math.round(minutes / 60) }) : t("{count}m", { count: minutes });
            prependToTimestamp(row, `⏳ ${t("Timed out, {time} left", { time: text })} · `);
        }));
    },
});

const FakeTag = definePlugin({
    id: "endcord.fake-tag",
    name: "FakeTag",
    description: tx("Adds a fake clan tag and badge emoji next to your username. Client-side only."),
    authors: [ENDCORD_AUTHOR],
    icon: "TagIcon",
    tags: ["Customisation", "Fun"],
    settings: {
        tag: { type: "string", label: tx("Tag"), description: tx("Tag text (up to 5 chars, auto-uppercased)."), default: "ECRD" },
        badgeUrl: { type: "string", label: tx("Badge image"), description: tx("Badge image URL (e.g. https://cdn.discordapp.com/emojis/ID.png)."), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("fake-tag", (row, message) => {
            const tag = store.tag.trim().slice(0, 5).toUpperCase();
            if (message.author?.id !== currentUserId() || !tag) return;
            row.clanTag = tag;
            row.clanTagGuildId ??= "0";
            if (store.badgeUrl.trim()) row.clanBadgeUrl = store.badgeUrl.trim();
        }));
    },
});

const DEFAULT_TONES: Record<string, string> = {
    j: tx("joking"), hj: tx("half-joking"), s: tx("sarcastic"), srs: tx("serious"), lh: tx("light-hearted"), g: tx("genuine"),
    gen: tx("genuine"), gq: tx("genuine question"), pos: tx("positive"), neg: tx("negative"), p: tx("platonic"), r: tx("romantic"),
    t: tx("teasing"), nm: tx("not mad"), lu: tx("a little upset"), nbh: tx("nobody here"), nsrs: tx("not serious"), rh: tx("rhetorical"),
    rt: tx("rhetorical"), ref: tx("reference"), m: tx("metaphorically"), li: tx("literally"), hyp: tx("hyperbole"), th: tx("threat"),
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The tones and the pattern that finds them, from the prefix and custom indicators settings */
function compileTones(key: string) {
    const [prefix, customText]: [string, string] = JSON.parse(key);
    const custom = Object.fromEntries(customText.split(";").map(p => p.split("=").map(s => s.trim())).filter(p => p[0] && p[1]).map(([k, v]) => [k.toLowerCase(), v]));
    const tones: Record<string, string> = { ...DEFAULT_TONES, ...custom };
    const re = new RegExp(`(^|\\s)${escapeRegex(prefix)}(${Object.keys(tones).map(escapeRegex).join("|")})(?=$|[\\s.,!?])`, "gi");
    return { tones, re };
}

function annotateTones(nodes: any[], tones: Record<string, string>, re: RegExp): any[] {
    return nodes.map(node => {
        if (node?.type === "text" && typeof node.content === "string") {
            const content = node.content.replace(re, (m: string, space: string, tone: string) => `${m} (${t(tones[tone.toLowerCase()])})`);
            return content === node.content ? node : { ...node, content };
        }
        if (Array.isArray(node?.content)) return { ...node, content: annotateTones(node.content, tones, re) };
        return node;
    });
}

const ToneIndicators = definePlugin({
    id: "endcord.tone-indicators",
    name: "ToneIndicators",
    description: tx("Explains tone indicators like /srs and /gen next to them in messages"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        prefix: { type: "string", label: tx("Prefix"), description: tx("Prefix character(s) for tone indicators."), default: "/" },
        customIndicators: { type: "string", label: tx("Custom indicators"), description: tx("Custom tone indicators (format: jk=Joking; srs=Serious)"), default: "" },
    },
    start({ store, cleanup }) {
        const compiled = cached(compileTones);
        cleanup(onMessageRow("tone-indicators", row => {
            if (!Array.isArray(row.content) || !store.prefix) return;
            const { tones, re } = compiled(JSON.stringify([store.prefix, store.customIndicators]));
            row.content = annotateTones(row.content, tones, re);
        }, RowOrder.ADJUST));
    },
});

// Days of friendship and the badge for them
const RANKS: Array<[number, string]> = [[365 * 5, "💎"], [365 * 2, "🏆"], [365, "⭐"], [180, "🌳"], [30, "🌿"], [0, "🌱"]];

const FriendshipRanks = definePlugin({
    id: "endcord.friendship-ranks",
    name: "FriendshipRanks",
    description: tx("Adds badges showcasing how long you have been friends with a user for"),
    authors: [ENDCORD_AUTHOR],
    icon: "FriendsIcon",
    tags: ["Friends", "Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("friendship-ranks", (row, message) => {
            const since = getStore("RelationshipStore")?.getSince?.(message.author?.id);
            if (!since) return;
            const days = (Date.now() - Date.parse(since)) / 86_400_000;
            const rank = RANKS.find(([min]) => days >= min);
            if (rank) prependToTimestamp(row, `${rank[1]} `);
        }));
    },
});

export default [
    MessageLatency, PinIcon, WordCount, RealtimeTimestamps, CustomTimestamps, Timezones, UserMessagesPronouns, ShowMeYourName,
    IrcColors, CustomUserColors, ShowRolesInChat, SilentEdit, ShowTimeoutDuration, FakeTag, ToneIndicators, FriendshipRanks,
];
