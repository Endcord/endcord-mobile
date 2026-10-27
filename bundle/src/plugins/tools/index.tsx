/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Utilities: your own commands, exports and backups, previews, and small conveniences.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { Button, Stack } from "@metro/common/components";
import { useEffect, useState } from "react";

import { definePlugin, ENDCORD_AUTHOR, onSettingChange } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore, guildRoles, onAction, subscribe } from "../common";
import {
    api, botMessage, command, copy, currentChannelId, deleteMessage, generatedIcon, getGuild, getUser, insertText,
    localSnowflake, MAX_SHARE_LENGTH, onIncomingMessage, onMessageRow, onSend, openUrl, receiveLocalMessage, share
} from "../hooks";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const CustomCommands = definePlugin({
    id: "endcord.custom-commands",
    name: "CustomCommands",
    description: tx("Allows you to create custom slash commands / tags"),
    authors: [ENDCORD_AUTHOR],
    icon: "SlashBoxIcon",
    tags: ["Chat", "Utility"],
    settings: {
        commands: {
            type: "string",
            label: tx("Commands"),
            description: tx("One per line: name = what it sends. Use \\n for a new line."),
            placeholder: "rules = Please read #rules before posting",
            multiline: true,
            default: "",
        },
    },
    start({ store, cleanup }) {
        let unregister: Array<() => void> = [];
        const register = () => {
            unregister.forEach(u => u());
            unregister = [];
            for (const line of store.commands.split("\n")) {
                const index = line.indexOf("=");
                // Discord's rules for command names: lowercase letters, digits, - and _, at most 32 of them
                const name = line.slice(0, index).trim().toLowerCase().replace(/[^\w-]/g, "").slice(0, 32);
                const response = line.slice(index + 1).trim().replace(/\\n/g, "\n");
                if (index <= 0 || !name || !response) continue;
                unregister.push(command({
                    name,
                    description: response.length > 90 ? `${response.slice(0, 89)}…` : response,
                    options: [{ name: "extra", description: tx("Text to add after it") }],
                    run: ({ extra }) => extra ? `${response} ${extra}` : response,
                }));
            }
        };
        register();
        let timer: ReturnType<typeof setTimeout> | undefined;
        cleanup(
            () => {
                clearTimeout(timer);
                unregister.forEach(u => u());
            },
            onSettingChange(store, () => {
                clearTimeout(timer);
                timer = setTimeout(register, 800);
            }),
        );
    },
});

function rawUser(user: any) {
    return {
        id: user.id,
        username: user.username,
        global_name: user.globalName ?? user.global_name ?? null,
        discriminator: user.discriminator ?? "0",
        avatar: user.avatar ?? null,
        bot: !!user.bot,
    };
}

const FakeMessage = definePlugin({
    id: "endcord.fake-message",
    name: "FakeMessage",
    description: tx("Send a client-side fake message posed as any user via /fakemsg. Only you can see it."),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "fakemsg",
            description: tx("Show a message from someone that only you can see"),
            options: [
                { name: "user", description: tx("Who it's from"), type: "user", required: true },
                { name: "message", description: tx("What it says"), required: true },
            ],
            run: ({ user: userId, message }, ctx) => {
                const user = getUser(userId);
                if (!user) {
                    botMessage(ctx.channel.id, t("Couldn't find that user."));
                    return;
                }
                receiveLocalMessage(ctx.channel.id, {
                    id: localSnowflake(),
                    channel_id: ctx.channel.id,
                    guild_id: ctx.channel.guild_id,
                    author: rawUser(user),
                    content: String(message),
                    timestamp: new Date().toISOString(),
                    edited_timestamp: null,
                    type: 0,
                    flags: 0,
                    tts: false,
                    mention_everyone: false,
                    mentions: [],
                    mention_roles: [],
                    attachments: [],
                    embeds: [],
                    reactions: [],
                    pinned: false,
                    state: "SENT",
                });
            },
        }));
    },
});

function FriendCodesPage() {
    const [invites, setInvites] = useState<any[] | null>(null);
    const module = findByProps("createFriendInvite", "getAllFriendInvites");
    const refresh = () => module?.getAllFriendInvites?.().then(setInvites).catch(() => setInvites([]));
    useEffect(() => void refresh(), []);
    return <Stack spacing={8}>
        <LogList
            title={t("Your Friend Codes")}
            empty={invites === null ? t("Loading...") : t("You don't have any friend codes yet")}
            entries={(invites ?? []).map((i: any) => ({
                key: i.code,
                label: `discord.gg/${i.code}`,
                subLabel: `${t("Expires")}: ${new Date(i.expires_at).toLocaleString()} · ${t("Uses")}: ${i.uses ?? 0}/${i.max_uses}`,
                icon: "LinkIcon",
                onPress: () => copy(`https://discord.gg/${i.code}`),
            }))}
        />
        <Button text={t("Create Friend Code")} variant="primary" icon={findAssetId("PlusSmallIcon")} onPress={() => module?.createFriendInvite?.().then(refresh)} />
        {!!invites?.length && <Button text={t("Revoke all Friend Codes")} variant="destructive" icon={findAssetId("TrashIcon")} onPress={() => module?.revokeFriendInvites?.().then(refresh)} />}
    </Stack>;
}

const FriendCodes = definePlugin({
    id: "endcord.friend-codes",
    name: "FriendCodes",
    description: tx("Create and manage friend invite links in the plugin's settings, to add friends easily"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserPlusIcon",
    tags: ["Friends"],
    SettingsComponent: FriendCodesPage,
    start() { },
});

/** Your messages in a channel, newest first, reading back up to `limit` messages */
async function myMessages(channelId: string, limit: number) {
    const mine: any[] = [];
    let before: string | undefined;
    let read = 0;
    while (read < limit) {
        const page: any[] = await api("get", `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`);
        if (!Array.isArray(page) || !page.length) break;
        read += page.length;
        mine.push(...page.filter(m => m.author?.id === currentUserId()));
        before = page[page.length - 1].id;
        if (page.length < 100) break;
    }
    return mine;
}

const ClearMyMessages = definePlugin({
    id: "endcord.clear-my-messages",
    name: "ClearMyMessages",
    description: tx("Delete your recent messages in a channel with /clearmessages"),
    authors: [ENDCORD_AUTHOR],
    icon: "TrashIcon",
    tags: ["Privacy", "Chat"],
    start({ cleanup }) {
        let running = false;
        cleanup(command({
            name: "clearmessages",
            description: tx("Delete your recent messages in this channel"),
            options: [{ name: "count", description: tx("How many of your messages (up to 200)"), type: "integer", required: true }],
            run: async ({ count }, ctx) => {
                if (running) {
                    botMessage(ctx.channel.id, t("Already deleting messages; wait for it to finish."));
                    return;
                }
                running = true;
                try {
                    const wanted = Math.min(Math.max(Number(count) || 0, 1), 200);
                    const mine = (await myMessages(ctx.channel.id, 1000)).slice(0, wanted);
                    botMessage(ctx.channel.id, t("Deleting {count} of your messages…", { count: mine.length }));
                    for (const message of mine) {
                        await Promise.resolve(deleteMessage(ctx.channel.id, message.id)).catch(() => { });
                        // Discord limits deletes to about one a second
                        await sleep(1100);
                    }
                    botMessage(ctx.channel.id, t("Deleted {count} messages.", { count: mine.length }));
                } finally {
                    running = false;
                }
            },
        }));
    },
});

const ExportDM = definePlugin({
    id: "endcord.export-dm",
    name: "ExportDM",
    description: tx("Export a chat's messages, attachments, stickers and reactions as TXT, Markdown or JSON with /exportdm"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShareIcon",
    tags: ["Utility", "Privacy"],
    settings: {
        format: {
            type: "select",
            label: tx("Format"),
            default: "txt",
            options: [{ label: "TXT", value: "txt" }, { label: "Markdown", value: "md" }, { label: "JSON", value: "json" }],
        },
        limit: { type: "number", label: tx("Messages"), description: tx("How many of the latest messages to export"), default: 500, min: 50, max: 5000 },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "exportdm",
            description: tx("Export the messages of this chat and share them"),
            run: async (_, ctx) => {
                botMessage(ctx.channel.id, t("Exporting…"));
                const messages: any[] = [];
                let before: string | undefined;
                while (messages.length < store.limit) {
                    const page: any[] = await api("get", `/channels/${ctx.channel.id}/messages?limit=100${before ? `&before=${before}` : ""}`);
                    if (!Array.isArray(page) || !page.length) break;
                    messages.push(...page);
                    before = page[page.length - 1].id;
                    if (page.length < 100) break;
                    await sleep(300);
                }
                messages.reverse();
                const name = (m: any) => m.author?.global_name ?? m.author?.username ?? "?";
                const extras = (m: any) => [
                    ...(m.attachments ?? []).map((a: any) => a.url),
                    ...(m.sticker_items ?? []).map((s: any) => `[${t("Sticker")}: ${s.name}]`),
                    ...(m.reactions ?? []).map((r: any) => `${r.emoji?.name} ×${r.count}`),
                ];
                const render = (list: any[]) => {
                    if (store.format === "json") return JSON.stringify(list);
                    if (store.format === "md") return list.map(m => `**${name(m)}** — ${new Date(m.timestamp).toLocaleString()}\n${[m.content, ...extras(m)].filter(Boolean).join("\n")}`).join("\n\n");
                    return list.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${name(m)}: ${[m.content, ...extras(m)].filter(Boolean).join(" ")}`).join("\n");
                };
                // The share sheet takes only so much text; the oldest messages are left out until it fits
                let shown = messages;
                let text = render(shown);
                while (text.length > MAX_SHARE_LENGTH && shown.length > 1) {
                    shown = shown.slice(Math.ceil(shown.length / 10));
                    text = render(shown);
                }
                if (shown.length < messages.length) botMessage(ctx.channel.id, t("That was too long to share at once, so the export has the latest {count} messages.", { count: shown.length }));
                await share(text, t("Export"));
            },
        }));
    },
});

const ServerBackup = definePlugin({
    id: "endcord.server-backup",
    name: "ServerBackup",
    description: tx("Export a server's channels, roles and permissions to a backup file with /serverbackup"),
    authors: [ENDCORD_AUTHOR],
    icon: "ServerIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "serverbackup",
            description: tx("Export this server's channels and roles and share them"),
            run: async (_, ctx) => {
                const guild = getGuild(ctx.channel.guild_id);
                if (!guild) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const [channels, roles] = await Promise.all([
                    api("get", `/guilds/${guild.id}/channels`),
                    api("get", `/guilds/${guild.id}/roles`).catch(() => Object.values(guildRoles(guild.id))),
                ]);
                const backup = {
                    format: "endcord-server-backup",
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    guild: { id: guild.id, name: guild.name, icon: guild.icon, description: guild.description, verificationLevel: guild.verificationLevel },
                    roles,
                    channels,
                };
                // Without indentation, so bigger servers still fit in the share sheet
                await share(JSON.stringify(backup), `${guild.name}.json`);
            },
        }));
    },
});

const HopOn = definePlugin({
    id: "endcord.hop-on",
    name: "HopOn",
    description: tx("Hop on! Opens a configurable URL when a message matches a custom regex in the current channel."),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkExternalSmallIcon",
    tags: ["Fun", "Utility"],
    settings: {
        regex: { type: "string", label: tx("Pattern"), description: tx("Regex to trigger on"), default: "\\bhop on\\b" },
        url: { type: "string", label: tx("Link"), description: tx("URL to open"), placeholder: "https://…", default: "" },
    },
    start({ store, cleanup }) {
        let lastOpened = 0;
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            if (optimistic || !message?.content || message.channel_id !== currentChannelId() || message.author?.id === currentUserId()) return;
            if (!/^https?:\/\//.test(store.url.trim()) || Date.now() - lastOpened < 10_000) return;
            try {
                if (!new RegExp(store.regex, "i").test(message.content)) return;
            } catch {
                return;
            }
            lastOpened = Date.now();
            openUrl(store.url.trim());
        }));
    },
});

const MessageFetchTimer = definePlugin({
    id: "endcord.message-fetch-timer",
    name: "MessageFetchTimer",
    description: tx("Shows how long it took to fetch messages for the current channel"),
    authors: [ENDCORD_AUTHOR],
    icon: "TimerIcon",
    tags: ["Utility"],
    settings: {
        showMs: { type: "boolean", label: tx("Milliseconds"), description: tx("Show milliseconds in timing"), default: true },
    },
    start({ store, cleanup }) {
        const started = new Map<string, number>();
        cleanup(
            onAction<{ channelId: string; }>("LOAD_MESSAGES", ({ channelId }) => void started.set(channelId, Date.now())),
            onAction<{ channelId: string; }>("LOAD_MESSAGES_SUCCESS", ({ channelId }) => {
                const at = started.get(channelId);
                if (!at) return;
                started.delete(channelId);
                if (channelId !== currentChannelId()) return;
                const ms = Date.now() - at;
                showToast(t("Messages loaded in {time}", { time: store.showMs ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s` }), findAssetId("TimerIcon"));
            }),
        );
    },
});

const ContentWarning = definePlugin({
    id: "endcord.content-warning",
    name: "ContentWarning",
    description: tx("Hides messages with trigger words you choose behind a spoiler you tap to reveal"),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeSlashIcon",
    tags: ["Chat", "Privacy"],
    settings: {
        words: { type: "string", label: tx("Trigger words"), description: tx("Comma-separated words; messages with them are hidden behind a spoiler"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onIncomingMessage("content-warning", message => {
            const words = store.words.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
            const content: string = message.content ?? "";
            if (!words.length || !content || message.author?.id === currentUserId()) return;
            const lower = content.toLowerCase();
            const found = words.find(w => lower.includes(w));
            if (!found || /^\|\|[\s\S]*\|\|$/.test(content)) return;
            // Code blocks can't be inside a spoiler, so they're left as they are
            const hidden = content.split(/(```[\s\S]*?```)/g).map((part, i) => i % 2 || !part.trim() ? part : `||${part.replace(/\|\|/g, "")}||`).join("");
            return { ...message, content: `⚠️ ${t("Content warning: {word}", { word: found })}\n${hidden}` };
        }));
    },
});

const SendTimestamps = definePlugin({
    id: "endcord.send-timestamps",
    name: "SendTimestamps",
    description: tx("Times written like `14:30` become timestamps everyone sees in their own time zone; a chat bar button inserts the current time"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Chat", "Utility"],
    settings: {
        replaceMessageContents: { type: "boolean", label: tx("Text shortcuts"), description: tx("Times written between backticks, like `14:30` or `2:30 PM`, become timestamps everyone sees in their own time zone"), default: true },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            description: tx("A button that inserts the current time as a timestamp"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        const parse = (time: string) => {
            const match = time.match(/^(\d{1,2}):(\d{2}) ?(AM|PM)?$/i);
            if (!match) return time;
            let hours = Number(match[1]);
            const minutes = Number(match[2]);
            if (match[3]) hours = hours % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
            if (hours > 23 || minutes > 59) return time;
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return `<t:${Math.floor(date.getTime() / 1000)}:t>`;
        };
        cleanup(
            onSend("send-timestamps", content => {
                if (!store.replaceMessageContents) return;
                return content.replace(/`(\d{1,2}:\d{2} ?(?:AM|PM)?)`/gi, (m, time) => {
                    const out = parse(time);
                    return out === time ? m : out;
                });
            }, 12),
            addChatButton({
                key: "send-timestamps",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const Button = getChatInputActionButton();
                    const Icon = generatedIcon("ClockIcon");
                    if (!Button || !Icon) return null;
                    return <Button
                        accessibilityLabel={t("Insert Timestamp")}
                        IconComponent={Icon}
                        onPress={() => choose(t("Insert Timestamp"), [
                            { label: t("Time"), value: "t" },
                            { label: t("Date and time"), value: "f" },
                            { label: t("Relative"), value: "R" },
                        ], format => {
                            const channelId = currentChannelId();
                            const stamp = `<t:${Math.floor(Date.now() / 1000)}:${format}> `;
                            if (!channelId || !insertText(channelId, stamp)) copy(stamp.trim());
                        })}
                    />;
                },
            }),
        );
    },
});

const MemberCount = definePlugin({
    id: "endcord.member-count",
    name: "MemberCount",
    description: tx("See how many members a server has, how many are online and how many are in voice, with /membercount"),
    authors: [ENDCORD_AUTHOR],
    icon: "GroupIcon",
    tags: ["Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "membercount",
            description: tx("Show how many members this server has (only you see it)"),
            run: (_, ctx) => {
                const guildId = ctx.channel.guild_id;
                if (!guildId) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const counts = getStore("GuildMemberCountStore");
                const total = counts?.getMemberCount?.(guildId);
                const online = counts?.getOnlineCount?.(guildId);
                const voice = Object.values<any>(getStore("VoiceStateStore")?.getVoiceStates?.(guildId) ?? {}).length;
                botMessage(ctx.channel.id, [
                    `👥 **${getGuild(guildId)?.name}**`,
                    total != null && `> ${t("Members")}: **${total}**`,
                    online != null && `> ${t("Online")}: **${online}**`,
                    `> ${t("In voice")}: **${voice}**`,
                ].filter(Boolean).join("\n"));
            },
        }));
    },
});

const AlwaysAnimate = definePlugin({
    id: "endcord.always-animate",
    name: "AlwaysAnimate",
    description: tx("Animates anything that can be animated"),
    authors: [ENDCORD_AUTHOR],
    icon: "GifIcon",
    tags: ["Appearance", "Media"],
    start({ cleanup }) {
        const images = findByProps("getAvatarDecorationURL", "getUserAvatarURL") ?? findByProps("getUserAvatarURL");
        if (!images) throw new Error("Discord's image helpers weren't found");
        if (typeof images.getUserAvatarURL === "function") cleanup(before("getUserAvatarURL", images, args => void (args[1] = true)));
        if (typeof images.getAvatarDecorationURL === "function") cleanup(before("getAvatarDecorationURL", images, ([props]) => void (props && (props.canAnimate = true))));
        if (typeof images.getGuildMemberAvatarURLSimple === "function") cleanup(before("getGuildMemberAvatarURLSimple", images, ([props]) => void (props && (props.canAnimate = true))));
        if (typeof images.getGuildIconURL === "function") cleanup(before("getGuildIconURL", images, ([props]) => void (props && (props.canAnimate = true))));
        cleanup(onMessageRow("always-animate", row => {
            if (typeof row.avatarURL === "string" && row.avatarURL.includes("/a_")) row.avatarURL = row.avatarURL.replace(/\.(webp|png)/, ".gif");
        }));
    },
});

const PreviewMessage = definePlugin({
    id: "endcord.preview-message",
    name: "PreviewMessage",
    description: tx("Lets you preview your message before sending it."),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeIcon",
    tags: ["Chat"],
    settings: {
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "right",
            options: [
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        cleanup(addChatButton({
            key: "preview-message",
            side: () => store.button as "left" | "right",
            render: () => {
                const Button = getChatInputActionButton();
                const Icon = generatedIcon("EyeIcon");
                if (!Button || !Icon) return null;
                return <Button
                    accessibilityLabel={t("Preview Message")}
                    IconComponent={Icon}
                    onPress={() => {
                        const channelId = currentChannelId();
                        const draft: string = channelId ? getStore("DraftStore")?.getDraft?.(channelId, 0) ?? "" : "";
                        if (!channelId || !draft.trim()) {
                            showToast(t("Type a message to preview it"), findAssetId("EyeIcon"));
                            return;
                        }
                        receiveLocalMessage(channelId, {
                            id: localSnowflake(),
                            channel_id: channelId,
                            author: rawUser(getStore("UserStore")?.getCurrentUser?.() ?? { id: currentUserId(), username: "?" }),
                            content: draft,
                            timestamp: new Date().toISOString(),
                            edited_timestamp: null,
                            type: 0,
                            flags: 64,
                            mentions: [],
                            mention_roles: [],
                            attachments: [],
                            embeds: [],
                            state: "SENT",
                        });
                    }}
                />;
            },
        }));
    },
});

export default [CustomCommands, FakeMessage, FriendCodes, ClearMyMessages, ExportDM, ServerBackup, HopOn, MessageFetchTimer, ContentWarning, SendTimestamps, MemberCount, AlwaysAnimate, PreviewMessage];
