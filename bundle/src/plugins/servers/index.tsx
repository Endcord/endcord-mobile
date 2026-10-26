/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Server tools from Endcord PC: moderation, roles, invites, emojis and finding your way around servers.
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR, onSettingChange } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { api, botMessage, command, copy, getChannel, getGuild, nativeColor, onIncomingMessage, onMessageRow, share } from "../hooks";
import { translate } from "../lookup";

const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));
const unix = (ms: number) => Math.floor(ms / 1000);
const snowflakeMs = (id: string) => Math.floor(Number(id) / 4194304) + 1420070400000;

/** A member's permissions in a server, from their roles; undefined when Discord's tables aren't there */
export function memberPermissions(guildId: string, userId: string): any {
    const guild = getGuild(guildId);
    const roles = getStore("GuildRoleStore")?.getRoles?.(guildId) ?? guild?.roles ?? {};
    const member = getStore("GuildMemberStore")?.getMember?.(guildId, userId);
    let bits: any = roles[guildId]?.permissions;
    for (const id of member?.roles ?? []) {
        try {
            if (roles[id]?.permissions != null) bits = bits == null ? roles[id].permissions : bits | roles[id].permissions;
        } catch { }
    }
    return bits;
}

export function hasPermission(bits: any, name: string): boolean {
    const flag = findByProps("Permissions", "ChannelTypes")?.Permissions?.[name];
    if (bits == null || flag == null) return false;
    try {
        return (bits & flag) === flag;
    } catch {
        return false;
    }
}

const canHere = (name: string, channel: any) => {
    const flag = findByProps("Permissions", "ChannelTypes")?.Permissions?.[name];
    return !!(flag != null && channel && getStore("PermissionStore")?.can?.(flag, channel));
};

// AutoDisconnectAndAutoMute --------------------------------------------------------------------------------------------

const AutoDisconnectAndAutoMute = definePlugin({
    id: "endcord.auto-disconnect-and-auto-mute",
    name: "AutoDisconnectAndAutoMute",
    description: tx("Automatically disconnect or mute selected users from voice channels"),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Servers"],
    settings: {
        users: { type: "string", label: tx("Users"), description: tx("User IDs separated by commas"), placeholder: tx("e.g. 123456789012345678, 234567890123456789"), default: "" },
        action: {
            type: "select",
            label: tx("What to do when they join a voice channel you can moderate"),
            default: "mute",
            options: [{ label: tx("Server mute them"), value: "mute" }, { label: tx("Server deafen them"), value: "deafen" }, { label: tx("Disconnect them"), value: "disconnect" }],
        },
        onlyMyChannel: { type: "boolean", label: tx("Only in my channel"), description: tx("Only act when they join the voice channel you're in"), default: true },
    },
    start({ store, cleanup }) {
        const handled = new Set<string>();
        cleanup(subscribe("VOICE_STATE_UPDATES", ({ voiceStates }) => {
            const mine = getStore("SelectedChannelStore")?.getVoiceChannelId?.();
            for (const state of voiceStates ?? []) {
                const key = `${state.userId}:${state.channelId}`;
                if (!state.channelId || !state.guildId || !ids(store.users).has(state.userId) || handled.has(key)) continue;
                if (store.onlyMyChannel && state.channelId !== mine) continue;
                const channel = getChannel(state.channelId);
                const body = store.action === "disconnect" ? { channel_id: null } : store.action === "deafen" ? { deaf: true } : { mute: true };
                const needed = store.action === "disconnect" ? "MOVE_MEMBERS" : store.action === "deafen" ? "DEAFEN_MEMBERS" : "MUTE_MEMBERS";
                if (!canHere(needed, channel)) continue;
                if (store.action === "mute" && state.mute || store.action === "deafen" && state.deaf) continue;
                handled.add(key);
                setTimeout(() => handled.delete(key), 10_000);
                api("patch", `/guilds/${state.guildId}/members/${state.userId}`, body).catch(() => { });
            }
        }));
    },
});

// BetterBanReasons -----------------------------------------------------------------------------------------------------

const BetterBanReasons = definePlugin({
    id: "endcord.better-ban-reasons",
    name: "BetterBanReasons",
    description: tx("Ban with /ban and your own saved reasons to pick from"),
    authors: [ENDCORD_AUTHOR],
    icon: "HammerIcon",
    tags: ["Servers"],
    settings: {
        reasons: {
            type: "string",
            label: tx("Your custom reasons"),
            description: tx("One per line; they're offered when you use /ban"),
            multiline: true,
            default: "Spam\nHarassment\nNSFW content\nRaiding",
        },
        deleteDays: { type: "number", label: tx("Delete their messages from the last (days)"), description: tx("0 keeps their messages"), default: 0, min: 0, max: 7 },
    },
    start({ store, cleanup }) {
        const reasons = () => store.reasons.split("\n").map(r => r.trim()).filter(Boolean).slice(0, 25);
        // The reasons are the command's choices, so it's registered again when they change
        let unregister: (() => void) | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const register = () => {
            unregister?.();
            unregister = banCommand();
        };
        cleanup(
            () => {
                clearTimeout(timer);
                unregister?.();
            },
            onSettingChange(store, key => {
                if (key !== "reasons") return;
                clearTimeout(timer);
                timer = setTimeout(register, 800);
            }),
        );
        const banCommand = () => command({
            name: "ban",
            description: tx("Ban someone from this server with a reason"),
            options: [
                { name: "user", description: tx("Who to ban"), type: "user", required: true },
                { name: "reason", description: tx("One of your saved reasons"), choices: reasons().map(r => ({ name: r.slice(0, 100), value: r })) },
                { name: "other", description: tx("Or write a reason") },
            ],
            run: async ({ user, reason: saved, other }, ctx) => {
                const reason = String(other ?? saved ?? "").trim() || undefined;
                const guildId = ctx.channel.guild_id;
                if (!guildId || !canHere("BAN_MEMBERS", ctx.channel)) {
                    botMessage(ctx.channel.id, t("You don't have permission to do that here."));
                    return;
                }
                const actions = findByProps("banUser", "kickUser") ?? findByProps("banUser");
                const seconds = store.deleteDays * 86400;
                if (actions?.banUser) await actions.banUser(guildId, user, seconds, reason);
                else await api("put", `/guilds/${guildId}/bans/${user}`, { delete_message_seconds: seconds });
                botMessage(ctx.channel.id, `🔨 ${reason ? t("Banned {user}: {reason}", { user: `<@${user}>`, reason }) : t("Banned {user}", { user: `<@${user}>` })}`);
            },
        });
        register();
    },
});

// BetterRoleContext ----------------------------------------------------------------------------------------------------

const BetterRoleContext = definePlugin({
    id: "endcord.better-role-context",
    name: "BetterRoleContext",
    description: tx("See a role's color, icon, members and permissions with /roleinfo"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "roleinfo",
            description: tx("Show information about a role (only you see it)"),
            options: [{ name: "role", description: tx("The role"), type: "role", required: true }],
            run: ({ role: roleId }, ctx) => {
                const guildId = ctx.channel.guild_id;
                const role = guildId && (getStore("GuildRoleStore")?.getRole?.(guildId, roleId) ?? getGuild(guildId)?.roles?.[roleId]);
                if (!role) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const members = (getStore("GuildMemberStore")?.getMembers?.(guildId) ?? []).filter((m: any) => m.roles?.includes(roleId)).length;
                const color = role.colorString ?? (role.color ? `#${role.color.toString(16).padStart(6, "0")}` : t("None"));
                const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions ?? {};
                const granted = Object.keys(permissions).filter(name => hasPermission(role.permissions, name));
                botMessage(ctx.channel.id, [
                    `**${role.name}** \`${role.id}\``,
                    `> ${t("Color")}: ${color}`,
                    `> ${t("Members Discord has loaded")}: ${members}`,
                    `> ${t("Created")}: <t:${unix(snowflakeMs(role.id))}:D>`,
                    role.icon && `> ${t("Icon")}: <https://cdn.discordapp.com/role-icons/${role.id}/${role.icon}.png>`,
                    role.hoist && `> ${t("Shown separately in the member list")}`,
                    role.mentionable && `> ${t("Anyone can mention it")}`,
                    `> ${t("Permissions")}: ${granted.includes("ADMINISTRATOR") ? t("Administrator: every permission") : granted.map(p => p.toLowerCase().replace(/_/g, " ")).join(", ") || "—"}`,
                ].filter(Boolean).join("\n"));
            },
        }));
    },
});

// InviteDefaults -------------------------------------------------------------------------------------------------------

const InviteDefaults = definePlugin({
    id: "endcord.invite-defaults",
    name: "InviteDefaults",
    description: tx("Create invites with your own defaults for how long they last and how many uses they have, with /invite"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Servers"],
    settings: {
        maxAge: {
            type: "select",
            label: tx("Expire after"),
            default: "604800",
            options: [
                { label: tx("30 minutes"), value: "1800" }, { label: tx("1 hour"), value: "3600" }, { label: tx("1 day"), value: "86400" },
                { label: tx("7 days"), value: "604800" }, { label: tx("Never"), value: "0" },
            ],
        },
        maxUses: { type: "number", label: tx("Max number of uses"), description: tx("0 means no limit"), default: 0, min: 0, max: 100 },
        temporary: { type: "boolean", label: tx("Temporary membership"), description: tx("People who join with it are kicked when they go offline unless they get a role"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "invite",
            description: tx("Create an invite to this channel with your defaults"),
            run: async (_, ctx) => {
                if (!ctx.channel.guild_id || !canHere("CREATE_INSTANT_INVITE", ctx.channel)) {
                    botMessage(ctx.channel.id, t("You don't have permission to do that here."));
                    return;
                }
                const invite = await api("post", `/channels/${ctx.channel.id}/invites`, { max_age: Number(store.maxAge), max_uses: store.maxUses, temporary: store.temporary, unique: true });
                copy(`https://discord.gg/${invite.code}`);
                botMessage(ctx.channel.id, `🔗 discord.gg/${invite.code}${invite.expires_at ? ` · ${t("Expires")}: <t:${unix(Date.parse(invite.expires_at))}:R>` : ""}`);
            },
        }));
    },
});

// GuildPickerDumper ----------------------------------------------------------------------------------------------------

const GuildPickerDumper = definePlugin({
    id: "endcord.guild-picker-dumper",
    name: "GuildPickerDumper",
    description: tx("Share the links of every emoji and sticker of a server with /dumpemojis"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Emotes", "Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "dumpemojis",
            description: tx("Share this server's emojis and stickers as a list of links"),
            run: async (_, ctx) => {
                const guildId = ctx.channel.guild_id;
                if (!guildId) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const emojis: any[] = getStore("EmojiStore")?.getGuildEmoji?.(guildId) ?? [];
                const stickers: any[] = getStore("StickersStore")?.getStickersByGuildId?.(guildId) ?? [];
                const lines = [
                    ...emojis.map(e => `:${e.name}: https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}`),
                    ...stickers.map(s => `${s.name}: https://media.discordapp.net/stickers/${s.id}.${s.format_type === 4 ? "gif" : "png"}`),
                ];
                if (!lines.length) {
                    botMessage(ctx.channel.id, t("This server has no emojis or stickers."));
                    return;
                }
                await share(lines.join("\n"), getGuild(guildId)?.name);
            },
        }));
    },
});

// MoreUserTags ---------------------------------------------------------------------------------------------------------

const MoreUserTags = definePlugin({
    id: "endcord.more-user-tags",
    name: "MoreUserTags",
    description: tx("Adds tags for webhooks and moderative roles (owner, admin, etc.)"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Appearance", "Chat"],
    settings: {
        owner: { type: "boolean", label: tx("Owner"), description: tx("Tag the server owner"), default: true },
        admin: { type: "boolean", label: tx("Admin"), description: tx("Tag members with the Administrator permission"), default: true },
        moderator: { type: "boolean", label: tx("Moderator"), description: tx("Tag members who can manage messages, kick, ban or time out"), default: true },
        webhook: { type: "boolean", label: tx("Webhook"), description: tx("Tag messages sent by webhooks"), default: true },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("more-user-tags", (row, message) => {
            if (typeof row.timestamp !== "string") return;
            const guildId = getChannel(message.channel_id)?.guild_id;
            let tag: string | undefined;
            if (message.webhookId && store.webhook) tag = t("WEBHOOK");
            else if (guildId && message.author?.id) {
                const bits = memberPermissions(guildId, message.author.id);
                if (store.owner && getGuild(guildId)?.ownerId === message.author.id) tag = t("OWNER");
                else if (store.admin && hasPermission(bits, "ADMINISTRATOR")) tag = t("ADMIN");
                else if (store.moderator && ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS"].some(p => hasPermission(bits, p))) tag = t("MOD");
            }
            if (tag && !row.timestamp.startsWith(`[${tag}]`)) row.timestamp = `[${tag}] ${row.timestamp}`;
        }));
    },
});

// MutualServerMembers --------------------------------------------------------------------------------------------------

const MutualServerMembers = definePlugin({
    id: "endcord.mutual-server-members",
    name: "MutualServerMembers",
    description: tx("Compare two servers you're in and see which members are in both, with /mutualmembers"),
    authors: [ENDCORD_AUTHOR],
    icon: "GroupIcon",
    tags: ["Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "mutualmembers",
            description: tx("Members that this server and another one share (from the members Discord has loaded)"),
            options: [{ name: "server", description: tx("The other server's ID"), required: true }],
            run: ({ server }, ctx) => {
                const here = ctx.channel.guild_id;
                const other = getGuild(String(server).trim());
                if (!here || !other) {
                    botMessage(ctx.channel.id, t("Use this in a server, with the ID of another server you're in."));
                    return;
                }
                const members = getStore("GuildMemberStore");
                const a = new Set<string>(members?.getMemberIds?.(here) ?? []);
                const shared = (members?.getMemberIds?.(other.id) ?? []).filter((id: string) => a.has(id) && id !== currentUserId());
                botMessage(ctx.channel.id, shared.length
                    ? `${t("{count} members are also in {server}:", { count: shared.length, server: other.name })}\n${shared.slice(0, 60).map((id: string) => `<@${id}>`).join(", ")}${shared.length > 60 ? `\n${t("…and {count} more", { count: shared.length - 60 })}` : ""}`
                    : t("No shared members among those Discord has loaded."));
            },
        }));
    },
});

// SurfaceTranslate -----------------------------------------------------------------------------------------------------

const SurfaceTranslate = definePlugin({
    id: "endcord.surface-translate",
    name: "SurfaceTranslate",
    description: tx("Translate a channel's name and topic with /translatechannel"),
    authors: [ENDCORD_AUTHOR],
    icon: "LanguageIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "translatechannel",
            description: tx("Translate this channel's name and topic (only you see it)"),
            run: async (_, ctx) => {
                const channel = getChannel(ctx.channel.id);
                const locale = (getStore("LocaleStore")?.locale ?? "en").split("-")[0];
                const name = channel?.name ? (await translate(channel.name.replace(/[-_]/g, " "), locale)).text : "";
                const topic = channel?.topic ? (await translate(channel.topic, locale)).text : "";
                botMessage(ctx.channel.id, [name && `**#${name}**`, topic || t("This channel has no topic.")].filter(Boolean).join("\n"));
            },
        }));
    },
});

// ServerSearch ---------------------------------------------------------------------------------------------------------

const ServerSearch = definePlugin({
    id: "endcord.server-search",
    name: "ServerSearch",
    description: tx("Find a server by name with /servers and open it from the result"),
    authors: [ENDCORD_AUTHOR],
    icon: "MagnifyingGlassIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "servers",
            description: tx("Find your servers by name (only you see it)"),
            options: [{ name: "name", description: tx("Part of the server's name"), required: true }],
            run: ({ name }, ctx) => {
                const query = String(name).toLowerCase();
                const found = Object.values<any>(getStore("GuildStore")?.getGuilds?.() ?? {}).filter(g => g.name?.toLowerCase().includes(query)).slice(0, 20);
                botMessage(ctx.channel.id, found.length
                    ? found.map(g => `**${g.name}** · ${getStore("GuildMemberCountStore")?.getMemberCount?.(g.id) ?? "?"} ${t("members")}\nhttps://discord.com/channels/${g.id}`).join("\n")
                    : t("No server matches \"{name}\".", { name }));
            },
        }));
    },
});

// BlurNSFW -------------------------------------------------------------------------------------------------------------

const BlurNSFW = definePlugin({
    id: "endcord.blur-nsfw",
    name: "BlurNSFW",
    description: tx("Hides attachments in age-restricted channels behind a spoiler until you tap them"),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeSlashIcon",
    tags: ["Media", "Privacy"],
    start({ cleanup }) {
        cleanup(onIncomingMessage("blur-nsfw", message => {
            const channel = getChannel(message.channel_id);
            const attachments: any[] = message.attachments ?? [];
            if (!channel?.nsfw || !attachments.length || attachments.every(a => a.filename?.startsWith("SPOILER_"))) return;
            // Discord shows files whose name starts with SPOILER_ blurred, until tapped
            return { ...message, attachments: attachments.map(a => a.filename?.startsWith("SPOILER_") ? a : { ...a, filename: `SPOILER_${a.filename}` }) };
        }));
    },
});

// GreetStickerPicker ---------------------------------------------------------------------------------------------------

const GreetStickerPicker = definePlugin({
    id: "endcord.greet-sticker-picker",
    name: "GreetStickerPicker",
    description: tx("Wave to someone in a new DM or a new member with the sticker you pick, with /greet"),
    authors: [ENDCORD_AUTHOR],
    icon: "StickerIcon",
    tags: ["Fun", "Emotes"],
    settings: {
        sticker: { type: "string", label: tx("Sticker ID"), description: tx("The sticker /greet sends when you don't pick one"), default: "749054660769218631" },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "greet",
            description: tx("Wave hi with a sticker"),
            options: [{ name: "sticker", description: tx("A sticker ID; leave it out for your default") }],
            run: async ({ sticker }, ctx) => {
                const id = String(sticker ?? store.sticker).trim();
                await api("post", `/channels/${ctx.channel.id}/greet`, { sticker_ids: [id] })
                    .catch(() => api("post", `/channels/${ctx.channel.id}/messages`, { sticker_ids: [id] }));
            },
        }));
    },
});

// UrlHighlighter -------------------------------------------------------------------------------------------------------

function globToRegex(glob: string) {
    return new RegExp(glob.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, "."), "i");
}

const UrlHighlighter = definePlugin({
    id: "endcord.url-highlighter",
    name: "UrlHighlighter",
    description: tx("Colors messages with links that match your patterns"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Chat"],
    settings: {
        patterns: { type: "string", label: tx("Patterns"), description: tx("One per line, like *github.com* or *.example.org/*"), multiline: true, default: "" },
        color: { type: "string", label: tx("Color"), description: tx("Like #f0b232"), default: "#f0b232" },
    },
    start({ store, cleanup }) {
        // Compiled again only when the setting changes
        let source: string | undefined;
        let compiled: RegExp[] = [];
        const patternsOf = (text: string) => {
            if (text !== source) {
                source = text;
                compiled = text.split("\n").filter(p => p.trim()).map(globToRegex);
            }
            return compiled;
        };
        cleanup(onMessageRow("url-highlighter", (row, message) => {
            const urls: string[] = String(message.content ?? "").match(/https?:\/\/\S+/g) ?? [];
            if (!urls.length) return;
            const patterns = patternsOf(store.patterns);
            if (!urls.some(u => patterns.some(p => p.test(u)))) return;
            const color = nativeColor(store.color.trim() || "#f0b232");
            if (color !== undefined) row.textColor = color;
        }));
    },
});

export default [
    AutoDisconnectAndAutoMute, BetterBanReasons, BetterRoleContext, InviteDefaults, GuildPickerDumper, MoreUserTags,
    MutualServerMembers, SurfaceTranslate, ServerSearch, BlurNSFW, GreetStickerPicker, UrlHighlighter,
];
