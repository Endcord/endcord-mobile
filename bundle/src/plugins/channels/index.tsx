/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins for getting around chats and reading them: notes, jumps, who's waiting for an answer, tables and badges.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore, subscribe } from "../common";
import { addMessageAction, api, botMessage, command, currentChannelId, displayName, generatedIcon, getChannel, getUser, jumpTo, loadedMessages, onIncomingMessage, onMessageRow, playSound, RowOrder, textNode } from "../hooks";
import { prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const preview = (text: string, length = 80) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};
const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));
const channelName = (id: string) => {
    const channel = getChannel(id);
    if (!channel) return id;
    if (channel.guild_id) return `#${channel.name}`;
    return channel.name || displayName(getUser(channel.recipients?.[0]));
};

// ChannelNotes ---------------------------------------------------------------------------------------------------------

const notes = wrapSync(createStorage<{ notes: Record<string, string>; }>(createMMKVBackend("ENDCORD_CHANNEL_NOTES", { notes: {} })));

function editNote(channelId: string) {
    prompt({
        title: t("Note for {channel}", { channel: channelName(channelId) }),
        description: t("Only you see it. Leave it empty to delete the note."),
        initial: notes.notes?.[channelId] ?? "",
        multiline: true,
        allowEmpty: true,
        onSubmit: value => {
            const all = { ...(notes.notes ?? {}) };
            if (value.trim()) all[channelId] = value.trim();
            else delete all[channelId];
            notes.notes = all;
        },
    });
}

function NotesPage() {
    useProxy(notes);
    return <LogList
        title={t("Channel Notes")}
        empty={t("Open a chat and use /note or the chat bar button to write one")}
        entries={Object.entries(notes.notes ?? {}).map(([id, text]) => ({ key: id, label: channelName(id), subLabel: preview(text, 120), onPress: () => editNote(id) }))}
    />;
}

const ChannelNotes = definePlugin({
    id: "endcord.channel-notes",
    name: "ChannelNotes",
    description: tx("Keep private notes on any channel, DM or group chat: rules, who is who, things to remember. Notes stay on your device."),
    authors: [ENDCORD_AUTHOR],
    icon: "PencilIcon",
    tags: ["Utility"],
    settings: {
        showOnOpen: { type: "boolean", label: tx("Show when I open the chat"), description: tx("Shows a chat's note as a notice when you open it"), default: false },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    SettingsComponent: NotesPage,
    async start({ store, cleanup }) {
        await awaitStorage(notes);
        cleanup(
            command({
                name: "note",
                description: tx("Show or write this chat's private note"),
                options: [{ name: "text", description: tx("The new note; leave it out to see the current one") }],
                run: ({ text }, ctx) => {
                    if (text) {
                        notes.notes = { ...(notes.notes ?? {}), [ctx.channel.id]: String(text) };
                        botMessage(ctx.channel.id, `📝 ${t("Note saved.")}`);
                    } else {
                        const note = notes.notes?.[ctx.channel.id];
                        botMessage(ctx.channel.id, note ? `📝 ${note}` : t("This chat has no note yet."));
                    }
                },
            }),
            subscribe("CHANNEL_SELECT", ({ channelId }) => {
                const note = store.showOnOpen && channelId && notes.notes?.[channelId];
                if (note) showToast(`📝 ${preview(note, 100)}`, findAssetId("PencilIcon"));
            }),
            addChatButton({
                key: "channel-notes",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const Button = getChatInputActionButton();
                    const Icon = generatedIcon("PencilIcon");
                    if (!Button || !Icon) return null;
                    return <Button accessibilityLabel={t("Channel Note")} IconComponent={Icon} onPress={() => {
                        const id = currentChannelId();
                        if (id) editNote(id);
                    }} />;
                },
            }),
        );
    },
});

// JumpTo ---------------------------------------------------------------------------------------------------------------

const JumpTo = definePlugin({
    id: "endcord.jump-to",
    name: "JumpTo",
    description: tx("Jump to the first or the latest message of a chat with /jumpto"),
    authors: [ENDCORD_AUTHOR],
    icon: "ArrowAngleLeftUpIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(command({
            name: "jumpto",
            description: tx("Jump to the start or the end of this chat"),
            options: [{ name: "where", description: tx("Where to go"), required: true, choices: [{ name: t("First message"), value: "first" }, { name: t("Latest message"), value: "last" }] }],
            run: async ({ where }, ctx) => {
                const channelId = ctx.channel.id;
                if (where === "last") {
                    const last = getChannel(channelId)?.lastMessageId ?? loadedMessages(channelId).at(-1)?.id;
                    if (last) jumpTo(channelId, last);
                    return;
                }
                const [first] = await api("get", `/channels/${channelId}/messages?after=0&limit=1`);
                if (first?.id) jumpTo(channelId, first.id);
                else botMessage(channelId, t("This chat has no messages."));
            },
        }));
    },
});

// LastActive -----------------------------------------------------------------------------------------------------------

const LastActive = definePlugin({
    id: "endcord.last-active",
    name: "LastActive",
    description: tx("Jump to the last message of yourself or someone else in a chat with /lastactive"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(command({
            name: "lastactive",
            description: tx("Jump to someone's last message here"),
            options: [{ name: "user", description: tx("Whose message (defaults to you)"), type: "user" }],
            run: async ({ user }, ctx) => {
                const userId = user ?? currentUserId();
                const channelId = ctx.channel.id;
                const loaded = [...loadedMessages(channelId)].reverse().find(m => m.author?.id === userId);
                if (loaded) return void jumpTo(channelId, loaded.id);
                const guildId = ctx.channel.guild_id;
                const url = guildId
                    ? `/guilds/${guildId}/messages/search?author_id=${userId}&channel_id=${channelId}`
                    : `/channels/${channelId}/messages/search?author_id=${userId}`;
                const result = await api("get", url);
                const found = result?.messages?.[0]?.[0] ?? result?.messages?.[0];
                if (found?.id) jumpTo(channelId, found.id);
                else botMessage(channelId, t("No messages from {user} here.", { user: displayName(getUser(userId) ?? { id: userId }) }));
            },
        }));
    },
});

// Ghosted --------------------------------------------------------------------------------------------------------------

interface Waiting {
    userId: string;
    at: number;
    preview: string;
}

const waiting = wrapSync(createStorage<{ chats: Record<string, Waiting>; }>(createMMKVBackend("ENDCORD_GHOSTED", { chats: {} })));
const waitingList = () => Object.entries(waiting.chats ?? {}).sort((a, b) => a[1].at - b[1].at);

function GhostedPage() {
    useProxy(waiting);
    return <LogList
        title={t("Waiting for Your Answer")}
        empty={t("Nobody is waiting for an answer from you 👻")}
        entries={waitingList().map(([channelId, w]) => ({
            key: channelId,
            label: `👻 ${displayName(getUser(w.userId) ?? { id: w.userId })}: ${preview(w.preview, 60)}`,
            subLabel: new Date(w.at).toLocaleString(),
            onPress: () => {
                const last = getChannel(channelId)?.lastMessageId;
                if (last) jumpTo(channelId, last);
            },
        }))}
    />;
}

const Ghosted = definePlugin({
    id: "endcord.ghosted",
    name: "Ghosted",
    description: tx("Keeps a list of the DMs you haven't answered yet, with a ghost for each"),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Friends", "Chat"],
    settings: {
        ignoreGroupDms: { type: "boolean", label: tx("Not group DMs"), description: tx("Exclude all group dms from ghosting"), default: true },
        exemptedChannels: { type: "string", label: tx("Never ghosted"), description: tx("Channel IDs, separated by commas, that are never listed"), default: "" },
    },
    SettingsComponent: GhostedPage,
    async start({ store, cleanup }) {
        await awaitStorage(waiting);
        cleanup(
            subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
                const channel = message && getChannel(message.channel_id);
                if (!channel || channel.guild_id || optimistic && message.author?.id !== currentUserId()) return;
                if (store.ignoreGroupDms && channel.type === 3 || ids(store.exemptedChannels).has(channel.id)) return;
                const mine = message.author?.id === currentUserId();
                // Saved only when the list changes, not for every message of a conversation
                if (mine && !waiting.chats?.[channel.id] || !mine && message.author?.bot) return;
                const chats = { ...(waiting.chats ?? {}) };
                if (mine) delete chats[channel.id];
                // Waiting since their first unanswered message, showing the latest
                else chats[channel.id] = { userId: message.author.id, at: chats[channel.id]?.at ?? Date.now(), preview: message.content || t("Sent an attachment") };
                waiting.chats = chats;
            }),
            command({
                name: "ghosted",
                description: tx("See who is waiting for your answer (only you see it)"),
                run: (_, ctx) => {
                    const list = waitingList();
                    botMessage(ctx.channel.id, list.length
                        ? list.slice(0, 25).map(([id, w]) => `👻 <@${w.userId}> · <#${id}> · <t:${Math.floor(w.at / 1000)}:R>`).join("\n")
                        : t("Nobody is waiting for an answer from you 👻"));
                },
            }),
        );
    },
});

// AntiSnitch -----------------------------------------------------------------------------------------------------------

const AntiSnitch = definePlugin({
    id: "endcord.anti-snitch",
    name: "AntiSnitch",
    description: tx("Alerts you with a sound and toast whenever selected users start typing in your current channel."),
    authors: [ENDCORD_AUTHOR],
    icon: "KeyboardIcon",
    tags: ["Notifications", "Fun"],
    settings: {
        users: { type: "string", label: tx("Users"), description: tx("User IDs separated by commas"), placeholder: tx("e.g. 123456789012345678, 234567890123456789"), default: "" },
        sound: { type: "string", label: tx("Sound"), description: tx("A link to a sound to play; leave empty for none"), default: "" },
    },
    start({ store, cleanup }) {
        const last = new Map<string, number>();
        cleanup(subscribe("TYPING_START", ({ channelId, userId }) => {
            if (channelId !== currentChannelId() || !ids(store.users).has(userId)) return;
            // Discord repeats this every few seconds while they type
            if (Date.now() - (last.get(userId) ?? 0) < 15_000) return;
            last.set(userId, Date.now());
            showToast(t("{user} is typing", { user: displayName(getUser(userId) ?? { id: userId }) }), findAssetId("KeyboardIcon"));
            if (store.sound.trim()) playSound(store.sound.trim());
        }));
    },
});

// MarkdownTables -------------------------------------------------------------------------------------------------------

const width = (s: string) => [...s].length;

/** GitHub-style tables to aligned monospace text, which Discord's mobile chat can show */
export function renderTables(content: string): string {
    const lines = content.split("\n");
    const out: string[] = [];
    let i = 0;
    let inCode = false;
    while (i < lines.length) {
        if (lines[i].trim().startsWith("```")) inCode = !inCode;
        const isTable = !inCode && /^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] ?? "");
        if (!isTable) {
            out.push(lines[i++]);
            continue;
        }
        const rows: string[][] = [];
        const align = lines[i + 1].split("|").slice(1, -1).map(c => c.trim().endsWith(":") ? (c.trim().startsWith(":") ? "center" : "right") : "left");
        rows.push(lines[i].split("|").slice(1, -1).map(c => c.trim()));
        i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++].split("|").slice(1, -1).map(c => c.trim()));
        const columns = Math.max(...rows.map(r => r.length));
        const widths = Array.from({ length: columns }, (_, c) => Math.max(...rows.map(r => width(r[c] ?? ""))));
        const pad = (cell: string, c: number) => {
            const space = widths[c] - width(cell);
            if (align[c] === "right") return " ".repeat(space) + cell;
            if (align[c] === "center") return " ".repeat(Math.floor(space / 2)) + cell + " ".repeat(Math.ceil(space / 2));
            return cell + " ".repeat(space);
        };
        const line = (r: string[]) => widths.map((_, c) => pad(r[c] ?? "", c)).join(" │ ");
        out.push("```", line(rows[0]), widths.map(w => "─".repeat(w)).join("─┼─"), ...rows.slice(1).map(line), "```");
    }
    return out.join("\n");
}

const MarkdownTables = definePlugin({
    id: "endcord.markdown-tables",
    name: "MarkdownTables",
    description: tx("Render GitHub-style markdown tables in Discord messages."),
    authors: [ENDCORD_AUTHOR],
    icon: "PaperIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(onIncomingMessage("markdown-tables", message => {
            const content: string = message.content ?? "";
            // Your own messages keep their text, which is what editing them starts from
            if (!content.includes("|") || !content.includes("-") || message.author?.id === currentUserId()) return;
            const rendered = renderTables(content);
            return rendered !== content ? { ...message, content: rendered } : undefined;
        }));
    },
});

// ImageLink ------------------------------------------------------------------------------------------------------------

const ImageLink = definePlugin({
    id: "endcord.image-link",
    name: "ImageLink",
    description: tx("Never hide image links in messages, even if it's the only content"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        cleanup(onMessageRow("image-link", (row, message) => {
            const content = String(message.content ?? "").trim();
            if (!/^https?:\/\/\S+$/.test(content)) return;
            const shown = Array.isArray(row.content) && row.content.some((n: any) => n && (n.type !== "text" || String(n.content ?? "").trim()));
            if (!shown) row.content = [textNode(content)];
        }, RowOrder.REPLACE));
    },
});

// ShowBadgesInChat -----------------------------------------------------------------------------------------------------

const BADGES: Array<[number, string]> = [
    [1 << 0, "🛠️"], [1 << 1, "🤝"], [1 << 2, "🎪"], [1 << 3, "🐛"], [1 << 14, "🐞"], [1 << 6, "💜"], [1 << 7, "🧡"], [1 << 8, "💚"],
    [1 << 9, "🎖️"], [1 << 17, "🧰"], [1 << 18, "🛡️"], [1 << 22, "💻"],
];

const ShowBadgesInChat = definePlugin({
    id: "endcord.show-badges-in-chat",
    name: "ShowBadgesInChat",
    description: tx("Shows the message author's badges beside their name in chat."),
    authors: [ENDCORD_AUTHOR],
    icon: "MedalIcon",
    tags: ["Chat", "Appearance"],
    start({ cleanup }) {
        cleanup(onMessageRow("show-badges-in-chat", (row, message) => {
            const flags = message.author?.publicFlags ?? message.author?.public_flags ?? 0;
            const badges = BADGES.filter(([bit]) => flags & bit).map(([, emoji]) => emoji).join("");
            if (badges && typeof row.timestamp === "string" && !row.timestamp.startsWith(badges)) row.timestamp = `${badges} ${row.timestamp}`;
        }));
    },
});

// UserVoiceShow --------------------------------------------------------------------------------------------------------

const voiceChannelOf = (userId?: string): string | undefined => userId ? getStore("VoiceStateStore")?.getVoiceStateForUser?.(userId)?.channelId ?? undefined : undefined;

const UserVoiceShow = definePlugin({
    id: "endcord.user-voice-show",
    name: "UserVoiceShow",
    description: tx("Shows an indicator on messages from people in a voice channel, and lets you join them from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Chat"],
    start({ cleanup }) {
        cleanup(
            onMessageRow("user-voice-show", (row, message) => {
                if (voiceChannelOf(message.author?.id) && typeof row.timestamp === "string" && !row.timestamp.startsWith("🔊")) row.timestamp = `🔊 ${row.timestamp}`;
            }),
            addMessageAction({
                key: "user-voice-show",
                icon: "VoiceNormalIcon",
                label: message => t("Join Them in {channel}", { channel: channelName(voiceChannelOf(message.author?.id)!) }),
                visible: message => {
                    const channelId = voiceChannelOf(message.author?.id);
                    return !!channelId && message.author.id !== currentUserId() && channelId !== getStore("SelectedChannelStore")?.getVoiceChannelId?.();
                },
                onPress: message => findByProps("selectVoiceChannel")?.selectVoiceChannel?.(voiceChannelOf(message.author.id)),
            }),
        );
    },
});

export default [ChannelNotes, JumpTo, LastActive, Ghosted, AntiSnitch, MarkdownTables, ImageLink, ShowBadgesInChat, UserVoiceShow];
