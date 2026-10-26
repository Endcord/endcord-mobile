/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins that decide what reaches you: messages, pings, stickers, calls and profile themes.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByName } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, onAction } from "../common";
import { addMessageAction, getChannel, hideLocally, onIncomingMessage } from "../hooks";

/** "1, 2,3 4" to a set of IDs */
const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));

const isBlocked = (userId?: string) => !!userId && !!getStore("RelationshipStore")?.isBlocked?.(userId);
const isIgnored = (userId?: string) => !!userId && !!getStore("RelationshipStore")?.isIgnored?.(userId);

const ClientSideBlock = definePlugin({
    id: "endcord.client-side-block",
    name: "ClientSideBlock",
    description: tx("Allows you to locally hide almost all content from any user"),
    authors: [ENDCORD_AUTHOR],
    icon: "DenyIcon",
    tags: ["Privacy", "Chat"],
    settings: {
        usersToBlock: {
            type: "string",
            label: tx("Hidden users"),
            description: tx("User IDs separated by a comma and a space"),
            placeholder: tx("e.g. 123456789012345678, 234567890123456789"),
            default: "",
        },
        hideBlockedUsers: { type: "boolean", label: tx("Hide blocked users too"), description: tx("Should blocked users also be hidden everywhere"), default: false },
        hideReplies: { type: "boolean", label: tx("Hide replies to them"), description: tx("Hide messages that reply to someone you have hidden"), default: true },
        guildBlackList: { type: "string", label: tx("Servers to skip"), description: tx("Guild ids to disable functionality in"), default: "" },
    },
    start({ store, cleanup }) {
        const hidden = (userId?: string) => !!userId && (ids(store.usersToBlock).has(userId) || store.hideBlockedUsers && isBlocked(userId));
        cleanup(
            onIncomingMessage("client-side-block", message => {
                const guildId = message.guild_id ?? getChannel(message.channel_id)?.guild_id;
                if (guildId && ids(store.guildBlackList).has(guildId)) return;
                if (hidden(message.author?.id)) return null;
                if (store.hideReplies && hidden(message.referenced_message?.author?.id)) return null;
            }),
            // Their typing isn't shown either
            onAction<{ userId: string; }>("TYPING_START", ({ userId }) => hidden(userId) ? false : undefined),
            addMessageAction({
                key: "client-side-block",
                icon: "DenyIcon",
                danger: true,
                label: () => t("Hide this user's messages"),
                visible: message => !!message.author?.id && message.author.id !== currentUserId() && !ids(store.usersToBlock).has(message.author.id),
                onPress: (message, channel) => {
                    store.usersToBlock = [...ids(store.usersToBlock), message.author.id].join(", ");
                    hideLocally(channel?.id ?? message.channel_id, message.id);
                    showToast(t("Messages from {user} are hidden. Reopen chats to hide older ones.", { user: message.author.username }), findAssetId("DenyIcon"));
                },
            }),
        );
    },
});

const NoBlockedMessages = definePlugin({
    id: "endcord.no-blocked-messages",
    name: "NoBlockedMessages",
    description: tx("Hides all blocked/ignored messages from chat completely"),
    authors: [ENDCORD_AUTHOR],
    icon: "DenyIcon",
    tags: ["Chat"],
    settings: {
        ignoreBlockedMessages: { type: "boolean", label: tx("Hide blocked users"), description: tx("Hide messages from users you blocked"), default: true },
        hideIgnored: { type: "boolean", label: tx("Hide ignored users"), description: tx("Hide messages from users you ignored"), default: true },
    },
    start({ store, cleanup }) {
        cleanup(onIncomingMessage("no-blocked-messages", message => {
            const author = message.author?.id;
            if (store.ignoreBlockedMessages && isBlocked(author) || store.hideIgnored && isIgnored(author)) return null;
        }));
    },
});

const SilenceUsers = definePlugin({
    id: "endcord.silence-users",
    name: "SilenceUsers",
    description: tx("Silences @mention pings and server badge counts from specific users. Regular messages and DMs are untouched."),
    authors: [ENDCORD_AUTHOR],
    icon: "BellSlashIcon",
    tags: ["Notifications"],
    settings: {
        mutedUserIds: {
            type: "string",
            label: tx("Silenced users"),
            description: tx("Comma-separated Discord user IDs to silence pings and server badges."),
            placeholder: tx("e.g. 123456789012345678, 234567890123456789"),
            default: "",
        },
    },
    start({ store, cleanup }) {
        cleanup(
            onIncomingMessage("silence-users", message => {
                const guildId = message.guild_id ?? getChannel(message.channel_id)?.guild_id;
                if (!guildId || !ids(store.mutedUserIds).has(message.author?.id)) return;
                if (!message.mentions?.length && !message.mention_roles?.length && !message.mention_everyone) return;
                return { ...message, mentions: [], mention_roles: [], mention_everyone: false };
            }),
            addMessageAction({
                key: "silence-users",
                icon: "BellSlashIcon",
                label: message => ids(store.mutedUserIds).has(message.author?.id) ? t("Stop silencing this user") : t("Silence this user's pings"),
                visible: (message, channel) => !!channel?.guild_id && message.author?.id !== currentUserId(),
                onPress: message => {
                    const list = ids(store.mutedUserIds);
                    if (!list.delete(message.author.id)) list.add(message.author.id);
                    store.mutedUserIds = [...list].join(", ");
                },
            }),
        );
    },
});

function keywordMatcher(words: string, useRegex: boolean, caseSensitive: boolean): (text: string) => boolean {
    const list = words.split(",").map(w => w.trim()).filter(Boolean);
    if (!list.length) return () => false;
    if (useRegex) {
        const patterns = list.flatMap(w => {
            try {
                return [new RegExp(w, caseSensitive ? "" : "i")];
            } catch {
                return [];
            }
        });
        return text => patterns.some(p => p.test(text));
    }
    const needles = caseSensitive ? list : list.map(w => w.toLowerCase());
    return text => {
        const haystack = caseSensitive ? text : text.toLowerCase();
        return needles.some(n => haystack.includes(n));
    };
}

const BlockKeywords = definePlugin({
    id: "endcord.block-keywords",
    name: "BlockKeywords",
    description: tx("Blocks messages containing specific user-defined keywords, as if the user sending them was blocked."),
    authors: [ENDCORD_AUTHOR],
    icon: "DenyIcon",
    tags: ["Chat", "Privacy"],
    settings: {
        blockedWords: { type: "string", label: tx("Blocked words"), description: tx("Comma-separated list of words to block"), default: "" },
        useRegex: { type: "boolean", label: tx("Regular expressions"), description: tx("Use each value as a regular expression when checking message content (advanced)"), default: false },
        caseSensitive: { type: "boolean", label: tx("Case sensitive"), description: tx("Whether to use a case sensitive search or not"), default: false },
        ignoreOwn: { type: "boolean", label: tx("Never hide my messages"), description: tx("Your own messages are always shown"), default: true },
    },
    start({ store, cleanup }) {
        // Built again only when the settings change, not for each of the many messages a chat loads
        let key = "";
        let matches: (text: string) => boolean = () => false;
        const matcher = () => {
            const current = `${store.useRegex}:${store.caseSensitive}:${store.blockedWords}`;
            if (current !== key) {
                key = current;
                matches = keywordMatcher(store.blockedWords, store.useRegex, store.caseSensitive);
            }
            return matches;
        };
        cleanup(onIncomingMessage("block-keywords", message => {
            if (store.ignoreOwn && message.author?.id === currentUserId()) return;
            const text = [message.content, ...(message.embeds ?? []).flatMap((e: any) => [e.title, e.description])].filter(Boolean).join("\n");
            if (text && matcher()(text)) return null;
        }));
    },
});

const StickerBlocker = definePlugin({
    id: "endcord.sticker-blocker",
    name: "StickerBlocker",
    description: tx("Allows you to block stickers from being displayed."),
    authors: [ENDCORD_AUTHOR],
    icon: "StickerIcon",
    tags: ["Chat", "Emotes"],
    settings: {
        showMessage: { type: "boolean", label: tx("Show a note"), description: tx("Whether to show a message detailing which id was blocked"), default: true },
        blockedStickers: { type: "string", label: tx("Blocked stickers"), description: tx("The list of blocked sticker IDs (don't edit unless you know what you're doing)"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(
            onIncomingMessage("sticker-blocker", message => {
                const stickers: any[] = message.sticker_items ?? message.stickers ?? [];
                const blocked = ids(store.blockedStickers);
                const kept = stickers.filter(s => !blocked.has(s.id));
                if (kept.length === stickers.length) return;
                const removed = stickers.filter(s => blocked.has(s.id));
                const note = store.showMessage ? `🚫 ${t("Blocked sticker: {name} ({id})", { name: removed[0].name, id: removed[0].id })}` : "";
                return {
                    ...message,
                    sticker_items: kept,
                    stickers: message.stickers ? kept : undefined,
                    content: message.content ? message.content : note,
                };
            }),
            addMessageAction({
                key: "sticker-blocker",
                icon: "StickerIcon",
                danger: true,
                label: () => t("Block Sticker"),
                visible: message => !!(message.stickerItems?.length || message.stickers?.length),
                onPress: (message, channel) => {
                    const stickers: any[] = message.stickerItems ?? message.stickers ?? [];
                    store.blockedStickers = [...ids(store.blockedStickers), ...stickers.map(s => s.id)].join(", ");
                    hideLocally(channel?.id ?? message.channel_id, message.id);
                    showToast(t("Sticker blocked"), findAssetId("StickerIcon"));
                },
            }),
        );
    },
});

const SPAM_FLAG = 1 << 20;

const ILoveSpam = definePlugin({
    id: "endcord.i-love-spam",
    name: "iLoveSpam",
    description: tx("Do not hide messages from 'likely spammers'"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    start({ cleanup }) {
        const MessageRecord = findByName("MessageRecord");
        if (typeof MessageRecord?.prototype?.hasFlag !== "function") throw new Error("Discord's message records weren't found");
        cleanup(instead("hasFlag", MessageRecord.prototype, function (this: any, args, original) {
            return args[0] === SPAM_FLAG ? false : original.apply(this, args);
        }));
    },
});

const ReplyPingControl = definePlugin({
    id: "endcord.reply-ping-control",
    name: "ReplyPingControl",
    description: tx("Control whether to always or never get pinged on message replies, with whitelist and blacklist features"),
    authors: [ENDCORD_AUTHOR],
    icon: "AtIcon",
    tags: ["Notifications"],
    settings: {
        alwaysPingOnReply: { type: "boolean", label: tx("Always ping me on replies"), description: tx("Always get pinged when someone replies to your messages"), default: false },
        replyPingWhitelist: { type: "string", label: tx("Always ping from"), description: tx("Comma-separated list of User IDs to always receive reply pings from"), default: "" },
        replyPingBlacklist: { type: "string", label: tx("Never ping from"), description: tx("Comma-separated list of User IDs to never receive reply pings from"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onIncomingMessage("reply-ping-control", message => {
            const me = currentUserId();
            const author = message.author?.id;
            if (!me || author === me || message.referenced_message?.author?.id !== me) return;
            const mentions: any[] = message.mentions ?? [];
            const mentioned = mentions.some(u => (u?.id ?? u) === me);
            if (ids(store.replyPingBlacklist).has(author)) {
                // Mentions written in the message still ping; only the reply's own ping goes
                if (!mentioned || new RegExp(`<@!?${me}>`).test(message.content ?? "")) return;
                return { ...message, mentions: mentions.filter(u => (u?.id ?? u) !== me) };
            }
            if (!mentioned && (store.alwaysPingOnReply || ids(store.replyPingWhitelist).has(author))) {
                const self = getStore("UserStore")?.getCurrentUser?.();
                return { ...message, mentions: [...mentions, { id: me, username: self?.username, discriminator: self?.discriminator ?? "0", avatar: self?.avatar ?? null }] };
            }
        }));
    },
});

const HideMessages = definePlugin({
    id: "endcord.hide-messages",
    name: "HideMessages",
    description: tx("Hide messages from the message menu until you restart Discord"),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeSlashIcon",
    tags: ["Chat", "Privacy"],
    start({ cleanup }) {
        const hidden = new Set<string>();
        cleanup(
            () => hidden.clear(),
            onIncomingMessage("hide-messages", message => hidden.has(message.id) ? null : undefined),
            addMessageAction({
                key: "hide-messages",
                icon: "EyeSlashIcon",
                label: () => t("Hide Message"),
                onPress: (message, channel) => {
                    hidden.add(message.id);
                    hideLocally(channel?.id ?? message.channel_id, message.id);
                },
            }),
        );
    },
});

const NoPendingCount = definePlugin({
    id: "endcord.no-pending-count",
    name: "NoPendingCount",
    description: tx("Removes the badge count of incoming friend requests and message requests"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserPlusIcon",
    tags: ["Notifications"],
    settings: {
        hideFriendRequestsCount: { type: "boolean", label: tx("Friend requests"), description: tx("Hide incoming friend requests count"), default: true },
        hideMessageRequestsCount: { type: "boolean", label: tx("Message requests"), description: tx("Hide message requests count"), default: true },
    },
    start({ store, cleanup }) {
        const relationships = getStore("RelationshipStore");
        const requests = getStore("MessageRequestStore");
        if (typeof relationships?.getPendingCount === "function") {
            cleanup(instead("getPendingCount", relationships, (args, original) => store.hideFriendRequestsCount ? 0 : original(...args)));
        }
        if (typeof requests?.getMessageRequestsCount === "function") {
            cleanup(instead("getMessageRequestsCount", requests, (args, original) => store.hideMessageRequestsCount ? 0 : original(...args)));
        }
        relationships?.emitChange?.();
        requests?.emitChange?.();
        cleanup(() => {
            relationships?.emitChange?.();
            requests?.emitChange?.();
        });
    },
});

const NoProfileThemes = definePlugin({
    id: "endcord.no-profile-themes",
    name: "NoProfileThemes",
    description: tx("Completely removes Nitro profile themes from everyone but yourself"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaintPaletteIcon",
    tags: ["Appearance"],
    start({ cleanup }) {
        const strip = (profile: any) => profile && { ...profile, theme_colors: undefined, themeColors: undefined };
        cleanup(onAction<{ user?: { id: string; }; user_profile?: any; guild_member_profile?: any; }>("USER_PROFILE_FETCH_SUCCESS", payload => {
            if (!payload.user || payload.user.id === currentUserId()) return;
            return { user_profile: strip(payload.user_profile), guild_member_profile: strip(payload.guild_member_profile) };
        }));
    },
});

const IgnoreCalls = definePlugin({
    id: "endcord.ignore-calls",
    name: "IgnoreCalls",
    description: tx("Allows you to ignore calls from specific users or dm groups."),
    authors: [ENDCORD_AUTHOR],
    icon: "PhoneHangUpIcon",
    tags: ["Privacy", "Voice"],
    settings: {
        permanentlyIgnoredUsers: {
            type: "string",
            label: tx("Ignored callers"),
            description: tx("User IDs (comma + space) who should be permanently ignored"),
            placeholder: tx("e.g. 123456789012345678, 234567890123456789"),
            default: "",
        },
        ignoredGroups: { type: "string", label: tx("Ignored group DMs"), description: tx("Channel IDs of group DMs whose calls don't ring"), default: "" },
    },
    start({ store, cleanup }) {
        const unring = (payload: { channelId: string; ringing?: string[]; }) => {
            const me = currentUserId();
            if (!me || !payload.ringing?.includes(me)) return;
            const channel = getChannel(payload.channelId);
            const ignored = ids(store.permanentlyIgnoredUsers);
            const fromIgnored = channel?.recipients?.length === 1 ? ignored.has(channel.recipients[0]) : ids(store.ignoredGroups).has(payload.channelId);
            if (fromIgnored) return { ringing: payload.ringing.filter(id => id !== me) };
        };
        cleanup(onAction("CALL_CREATE", unring as any), onAction("CALL_UPDATE", unring as any));
    },
});

export default [ClientSideBlock, NoBlockedMessages, SilenceUsers, BlockKeywords, StickerBlocker, ILoveSpam, ReplyPingControl, HideMessages, NoPendingCount, NoProfileThemes, IgnoreCalls];
