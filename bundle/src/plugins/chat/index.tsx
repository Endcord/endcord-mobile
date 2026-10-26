/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's chat plugins: long messages, reactions, replies and mentions, an AI helper, and feeling a ping.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { AppState, Vibration } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { appendToTimestamp, botMessage, command, MessageActions, onIncomingMessage, onMessageRow, onSend, snowflakeTime, toastError } from "../hooks";

// SplitLargeMessages ---------------------------------------------------------------------------------------------------

/** Splits text into pieces of at most `limit` characters, at a line break or space where it can */
export function splitMessage(text: string, limit: number): string[] {
    const parts: string[] = [];
    let rest = text;
    while (rest.length > limit) {
        let cut = rest.lastIndexOf("\n", limit);
        if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
        if (cut < limit / 2) cut = limit;
        parts.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).replace(/^[ \n]/, "");
    }
    if (rest.trim()) parts.push(rest);
    return parts;
}

const SplitLargeMessages = definePlugin({
    id: "endcord.split-large-messages",
    name: "SplitLargeMessages",
    description: tx("Splits oversized messages into Discord-sized chunks before sending."),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Chat"],
    settings: {
        delay: { type: "number", label: tx("Pause between parts (ms)"), description: tx("So they arrive in order and don't trip the rate limit"), default: 800, min: 300, max: 5000 },
    },
    start({ store, cleanup }) {
        const following = new Set<string>();
        cleanup(onSend("split-large-messages", async (content, { channelId, editing }) => {
            if (editing || following.delete(content)) return;
            const limit = getStore("UserStore")?.getCurrentUser?.()?.premiumType === 2 ? 4000 : 2000;
            if (content.length <= limit) return;
            const [first, ...others] = splitMessage(content, limit);
            // The rest go out after the first, each through the chat box's path
            (async () => {
                for (const part of others) {
                    await new Promise(r => setTimeout(r, store.delay));
                    following.add(part);
                    await MessageActions()?.sendMessage(channelId, { content: part, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, undefined, {});
                }
            })().catch(toastError);
            showToast(t("Sending in {count} parts", { count: others.length + 1 }), findAssetId("ChatIcon"));
            return first;
        }, 97));
    },
});

// SortReactions --------------------------------------------------------------------------------------------------------

const byCount = (a: any, b: any) => (b?.count ?? 0) - (a?.count ?? 0);

const SortReactions = definePlugin({
    id: "endcord.sort-reactions",
    name: "SortReactions",
    description: tx("Sorts reactions by count in chat."),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(
            onIncomingMessage("sort-reactions", message => {
                const { reactions } = message;
                if (!Array.isArray(reactions) || reactions.length < 2) return;
                return { ...message, reactions: [...reactions].sort(byCount) };
            }),
            // Reactions added while the chat is open
            onMessageRow("sort-reactions", row => {
                if (Array.isArray(row.reactions) && row.reactions.length > 1 && typeof row.reactions[0]?.count === "number") row.reactions = [...row.reactions].sort(byCount);
            }),
        );
    },
});

// ReplyTimestamp -------------------------------------------------------------------------------------------------------

const ReplyTimestamp = definePlugin({
    id: "endcord.reply-timestamp",
    name: "ReplyTimestamp",
    description: tx("Shows when the message a reply answers was sent, next to the reply's time"),
    authors: [ENDCORD_AUTHOR],
    icon: "ArrowAngleLeftUpIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("reply-timestamp", (row, message) => {
            const id = message.messageReference?.message_id ?? message.message_reference?.message_id;
            if (!id || !/^\d+$/.test(id)) return;
            const time = new Date(snowflakeTime(id));
            const today = time.toDateString() === new Date().toDateString();
            const text = today
                ? time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                : time.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            appendToTimestamp(row, ` · ↩ ${text}`);
        }));
    },
});

// MentionColors --------------------------------------------------------------------------------------------------------

const MentionColors = definePlugin({
    id: "endcord.mention-colors",
    name: "MentionColors",
    description: tx("Marks messages that mention you directly differently from @everyone and @here pings"),
    authors: [ENDCORD_AUTHOR],
    icon: "AtIcon",
    tags: ["Chat", "Notifications"],
    start({ cleanup }) {
        cleanup(onMessageRow("mention-colors", (row, message) => {
            const me = currentUserId();
            if (!me || message.author?.id === me) return;
            const users: any[] = message.mentions ?? [];
            if (users.some(u => (typeof u === "string" ? u : u?.id) === me)) return appendToTimestamp(row, ` · 🔔 ${t("you")}`);
            const roles: string[] = message.mentionRoles ?? message.mention_roles ?? [];
            const guildId = getStore("ChannelStore")?.getChannel?.(message.channel_id)?.guild_id;
            const mine: string[] = roles.length && guildId ? getStore("GuildMemberStore")?.getMember?.(guildId, me)?.roles ?? [] : [];
            if (roles.some(r => mine.includes(r))) return appendToTimestamp(row, ` · 🏷 ${t("your role")}`);
            if (message.mentionEveryone ?? message.mention_everyone) appendToTimestamp(row, " · 📣 @everyone");
        }));
    },
});

// VibrateOnPing --------------------------------------------------------------------------------------------------------

const PATTERNS: Record<string, number[]> = { short: [0, 60], double: [0, 70, 90, 70], long: [0, 350] };

const VibrateOnPing = definePlugin({
    id: "endcord.vibrate-on-ping",
    name: "VibrateOnPing",
    description: tx("Vibrates your phone when someone mentions you or DMs you while Discord is open"),
    authors: [ENDCORD_AUTHOR],
    icon: "BellIcon",
    tags: ["Notifications"],
    settings: {
        dms: { type: "boolean", label: tx("Direct messages too"), default: true },
        pattern: {
            type: "select",
            label: tx("Vibration"),
            default: "double",
            options: [{ label: tx("Short"), value: "short" }, { label: tx("Double"), value: "double" }, { label: tx("Long"), value: "long" }],
        },
    },
    start({ store, cleanup }) {
        let last = 0;
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            const me = currentUserId();
            if (optimistic || !message || !me || message.author?.id === me || AppState.currentState !== "active") return;
            // Do Not Disturb means no nudges
            if (getStore("PresenceStore")?.getStatus?.(me) === "dnd") return;
            const channel = getStore("ChannelStore")?.getChannel?.(message.channel_id);
            const direct = (message.mentions ?? []).some((u: any) => (u?.id ?? u) === me);
            const dm = store.dms && channel && !channel.guild_id;
            if (!direct && !dm) return;
            // The channel you're reading doesn't need a nudge, nor does a burst of messages
            if (getStore("SelectedChannelStore")?.getChannelId?.() === message.channel_id || Date.now() - last < 3000) return;
            last = Date.now();
            Vibration.vibrate(PATTERNS[store.pattern] ?? PATTERNS.double);
        }));
    },
});

// ChatGPT --------------------------------------------------------------------------------------------------------------

const ChatGPT = definePlugin({
    id: "endcord.chatgpt",
    name: "ChatGPT",
    description: tx("Allows using ChatGPT directly in Discord with configurable settings"),
    authors: [ENDCORD_AUTHOR],
    icon: "SparklesIcon",
    tags: ["Utility"],
    settings: {
        apiKey: { type: "string", label: tx("API key"), description: tx("Your own key from platform.openai.com; it stays on this phone"), default: "", placeholder: "sk-…" },
        model: { type: "string", label: tx("Model"), default: "gpt-4o-mini" },
        baseUrl: { type: "string", label: tx("API address"), description: tx("For OpenAI-compatible services; leave it as it is for OpenAI"), default: "https://api.openai.com/v1" },
        system: { type: "string", label: tx("Instructions"), description: tx("How it should answer"), default: "Answer briefly. Discord markdown is supported.", multiline: true },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "chatgpt",
            description: tx("Ask ChatGPT something"),
            options: [
                { name: "prompt", description: tx("Your question"), required: true },
                { name: "send", description: tx("Send the answer to the chat instead of only showing it to you"), type: "boolean" },
            ],
            run: async ({ prompt, send }, ctx) => {
                if (!store.apiKey.trim()) return botMessage(ctx.channel.id, t("Add your API key in the ChatGPT plugin's settings first."));
                botMessage(ctx.channel.id, t("Thinking…"));
                const res = await fetch(`${store.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${store.apiKey.trim()}` },
                    body: JSON.stringify({
                        model: store.model.trim() || "gpt-4o-mini",
                        messages: [...store.system.trim() ? [{ role: "system", content: store.system }] : [], { role: "user", content: String(prompt) }],
                    }),
                });
                const data = await res.json().catch(() => undefined);
                if (!res.ok) return botMessage(ctx.channel.id, t("ChatGPT answered with an error: {error}", { error: data?.error?.message ?? res.status }));
                const text = String(data?.choices?.[0]?.message?.content ?? "").trim().slice(0, 2000);
                if (send) return text;
                botMessage(ctx.channel.id, text || "…");
            },
        }));
    },
});

export default [SplitLargeMessages, SortReactions, ReplyTimestamp, MentionColors, VibrateOnPing, ChatGPT];
