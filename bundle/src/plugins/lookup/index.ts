/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Commands that look something up, on Discord or the web, and Translate.
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import {
    addMessageAction, api, botMessage, command, describeError, getGuild, getUser, onMessageRow, onSend,
    redrawMessage, textNode, toastError
} from "../hooks";

const CDN = "https://cdn.discordapp.com";
const unix = (ms: number) => Math.floor(ms / 1000);
const snowflakeMs = (id: string) => Math.floor(Number(id) / 4194304) + 1420070400000;

const WikiLookup = definePlugin({
    id: "endcord.wiki-lookup",
    name: "WikiLookup",
    description: tx("/wiki pulls a short Wikipedia summary for anything (sent only to you)."),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "wiki",
            description: tx("Look up a Wikipedia summary"),
            options: [{ name: "message", description: tx("What to look up"), required: true }],
            run: async ({ message }, ctx) => {
                const query = String(message).trim();
                if (!query) return;
                let data: any;
                try {
                    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
                    if (!res.ok) {
                        botMessage(ctx.channel.id, t("No Wikipedia article found for **{query}**.", { query }));
                        return;
                    }
                    data = await res.json();
                } catch {
                    botMessage(ctx.channel.id, t("Couldn't reach Wikipedia right now."));
                    return;
                }
                if (data.type === "disambiguation" || !data.extract) {
                    botMessage(ctx.channel.id, t("**{query}** is ambiguous — try being more specific.", { query }));
                    return;
                }
                const url = data.content_urls?.mobile?.page ?? data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`;
                botMessage(ctx.channel.id, `📚 **${data.title}**\n${data.extract}\n<${url}>`);
            },
        }));
    },
});

export function avatarUrl(user: any, size = 1024): string {
    if (user?.avatar) {
        const ext = user.avatar.startsWith("a_") ? "gif" : "png";
        return `${CDN}/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
    }
    const index = user?.discriminator && user.discriminator !== "0"
        ? Number(user.discriminator) % 5
        : Math.floor(Number(user?.id ?? 0) / 4194304) % 6;
    return `${CDN}/embed/avatars/${index}.png`;
}

const AvatarGrabber = definePlugin({
    id: "endcord.avatar-grabber",
    name: "AvatarGrabber",
    description: tx("/avatar grabs the full-resolution avatar of any user (or yourself)."),
    authors: [ENDCORD_AUTHOR],
    icon: "ImageIcon",
    tags: ["Utility", "Media"],
    start({ cleanup }) {
        cleanup(command({
            name: "avatar",
            description: tx("Get a user's full-size avatar"),
            options: [{ name: "user", description: tx("Whose avatar (defaults to you)"), type: "user" }],
            run: ({ user: userId }, ctx) => {
                const user = getUser(userId ?? currentUserId());
                if (!user) {
                    botMessage(ctx.channel.id, t("Couldn't find that user."));
                    return;
                }
                return avatarUrl(user, 4096);
            },
        }));
    },
});

const VERIFICATION = [tx("None"), tx("Low"), tx("Medium"), tx("High"), tx("Highest")];

const ServerInfo = definePlugin({
    id: "endcord.server-info",
    name: "ServerInfo",
    description: tx("Allows you to view info about a server"),
    authors: [ENDCORD_AUTHOR],
    icon: "ServerIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "serverinfo",
            description: tx("Show information about this server (only you see it)"),
            run: (_, ctx) => {
                const guild = getGuild(ctx.channel.guild_id);
                if (!guild) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const created = snowflakeMs(guild.id);
                const members = getStore("GuildMemberCountStore")?.getMemberCount?.(guild.id);
                const channels = Object.values(getStore("ChannelStore")?.getMutableGuildChannelsForGuild?.(guild.id) ?? {}).length;
                const roles = Object.keys(getStore("GuildRoleStore")?.getRoles?.(guild.id) ?? guild.roles ?? {}).length;
                const icon = guild.icon ? `${CDN}/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith("a_") ? "gif" : "png"}?size=1024` : null;
                const lines = [
                    `**${guild.name}**`,
                    `> **${t("ID")}**: \`${guild.id}\``,
                    `> **${t("Owner")}**: <@${guild.ownerId}>`,
                    `> **${t("Created")}**: <t:${unix(created)}:D> (<t:${unix(created)}:R>)`,
                    members != null && `> **${t("Members")}**: ${members}`,
                    channels && `> **${t("Channels")}**: ${channels}`,
                    roles && `> **${t("Roles")}**: ${roles}`,
                    `> **${t("Boosts")}**: ${guild.premiumSubscriberCount ?? 0} (${t("Level {level}", { level: guild.premiumTier ?? 0 })})`,
                    `> **${t("Verification level")}**: ${t(VERIFICATION[guild.verificationLevel] ?? VERIFICATION[0])}`,
                    guild.vanityURLCode && `> **${t("Vanity URL")}**: discord.gg/${guild.vanityURLCode}`,
                    icon && `> **${t("Icon")}**: <${icon}>`,
                ].filter(Boolean);
                botMessage(ctx.channel.id, lines.join("\n"));
            },
        }));
    },
});

const InRole = definePlugin({
    id: "endcord.in-role",
    name: "InRole",
    description: tx("See who has a role with /inrole"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "inrole",
            description: tx("See who has a role (only members Discord has loaded are listed)"),
            options: [{ name: "role", description: tx("The role"), type: "role", required: true }],
            run: ({ role: roleId }, ctx) => {
                const guildId = ctx.channel.guild_id;
                if (!guildId) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const members: any[] = getStore("GuildMemberStore")?.getMembers?.(guildId) ?? [];
                const ids = members.filter(m => m.roles?.includes(roleId)).map(m => m.userId);
                if (!ids.length) {
                    botMessage(ctx.channel.id, t("Nobody Discord has loaded has <@&{role}>. Scroll the member list to load more members.", { role: roleId }));
                    return;
                }
                const shown = ids.slice(0, 60).map(id => `<@${id}>`).join(", ");
                const more = ids.length > 60 ? `\n${t("…and {count} more", { count: ids.length - 60 })}` : "";
                botMessage(ctx.channel.id, `${t("{count} members have <@&{role}>:", { count: ids.length, role: roleId })}\n${shown}${more}`);
            },
        }));
    },
});

interface NowPlaying {
    trackId?: string | null;
    albumId?: string | null;
    artistId?: string | null;
}

/** What you're playing on Spotify, from Discord's Spotify store or your presence on another device */
function nowPlaying(): NowPlaying | undefined {
    const track = getStore("SpotifyStore")?.getTrack?.();
    if (track) return { trackId: track.id, albumId: track.album?.id, artistId: track.artists?.[0]?.id };
    const me = currentUserId();
    const activities: any[] = (me && getStore("PresenceStore")?.getActivities?.(me)) || [];
    const spotify = activities.find(a => a?.type === 2 && (a.party?.id?.startsWith("spotify:") || a.name === "Spotify"));
    if (!spotify) return;
    return { trackId: spotify.sync_id, albumId: spotify.metadata?.album_id, artistId: spotify.metadata?.artist_ids?.[0] };
}

const SpotifyShareCommands = definePlugin({
    id: "endcord.spotify-share-commands",
    name: "SpotifyShareCommands",
    description: tx("Share your current Spotify track, album or artist via slash command (/track, /album, /artist)"),
    authors: [ENDCORD_AUTHOR],
    icon: "SpotifyNeutralIcon",
    tags: ["Media"],
    start({ cleanup }) {
        const kinds = [
            ["track", tx("Share your current Spotify track in chat"), (n: NowPlaying) => n.trackId && `https://open.spotify.com/track/${n.trackId}`],
            ["album", tx("Share your current Spotify album in chat"), (n: NowPlaying) => n.albumId && `https://open.spotify.com/album/${n.albumId}`],
            ["artist", tx("Share your current Spotify artist in chat"), (n: NowPlaying) => n.artistId && `https://open.spotify.com/artist/${n.artistId}`],
        ] as const;
        for (const [name, description, url] of kinds) {
            cleanup(command({
                name,
                description,
                options: [{ name: "message", description: tx("Text to send with it") }],
                run: ({ message }, ctx) => {
                    const playing = nowPlaying();
                    if (!playing) {
                        botMessage(ctx.channel.id, t("You're not listening to any music."));
                        return;
                    }
                    const link = url(playing);
                    if (!link) {
                        botMessage(ctx.channel.id, t("Failed to find the track on spotify."));
                        return;
                    }
                    return message ? `${message} ${link}` : link;
                },
            }));
        }
    },
});

const HOUSES = [tx("Remove Badge"), tx("House Bravery"), tx("House Brilliance"), tx("House Balance")];

async function applyHouse(house: number) {
    if (house === 0) await api("del", "/hypesquad/online");
    else await api("post", "/hypesquad/online", { house_id: house });
}

const HypeSquadSwitcher = definePlugin({
    id: "endcord.hypesquad-switcher",
    name: "HypeSquadSwitcher",
    description: tx("Easily switch between HypeSquad houses or remove your badge"),
    authors: [ENDCORD_AUTHOR],
    icon: "MedalIcon",
    tags: ["Customisation"],
    start({ cleanup }) {
        cleanup(command({
            name: "hypesquad",
            description: tx("Apply or remove your HypeSquad badge"),
            options: [{
                name: "house",
                description: tx("The house to join, or none to remove the badge"),
                type: "integer",
                required: true,
                choices: HOUSES.map((label, value) => ({ name: t(label), value })),
            }],
            run: async ({ house }, ctx) => {
                const id = Number(house);
                try {
                    await applyHouse(id);
                    botMessage(ctx.channel.id, id === 0 ? `✅ ${t("HypeSquad badge removed")}` : `✅ ${t("HypeSquad set to {house}", { house: t(HOUSES[id]) })}`);
                } catch (e: any) {
                    botMessage(ctx.channel.id, `❌ ${t("Request failed: {error}", { error: describeError(e) })}`);
                }
            },
        }));
    },
});

const FriendInvites = definePlugin({
    id: "endcord.friend-invites",
    name: "FriendInvites",
    description: tx("Create, list and revoke friend invite links with /friendinvites"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserPlusIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        const invites = () => findByProps("createFriendInvite", "getAllFriendInvites");
        const line = (i: any) => `discord.gg/${i.code} · ${t("Expires")}: <t:${unix(new Date(i.expires_at).getTime())}:R> · ${t("Uses")}: \`${i.uses ?? 0}/${i.max_uses}\``;
        cleanup(command({
            name: "friendinvites",
            description: tx("Create, list or revoke your friend invite links"),
            options: [{
                name: "action",
                description: tx("What to do"),
                required: true,
                choices: [
                    { name: t("Create"), value: "create" },
                    { name: t("View"), value: "view" },
                    { name: t("Revoke all"), value: "revoke" },
                ],
            }],
            run: async ({ action }, ctx) => {
                const module = invites();
                if (action === "create") {
                    const invite = module?.createFriendInvite ? await module.createFriendInvite() : await api("post", "/users/@me/invites", {});
                    botMessage(ctx.channel.id, line(invite));
                } else if (action === "view") {
                    const all: any[] = module?.getAllFriendInvites ? await module.getAllFriendInvites() : await api("get", "/users/@me/invites");
                    botMessage(ctx.channel.id, all?.length ? all.map(line).join("\n") : t("You have no active friend invites!"));
                } else {
                    if (module?.revokeFriendInvites) await module.revokeFriendInvites();
                    else await api("del", "/users/@me/invites");
                    botMessage(ctx.channel.id, t("All friend invites have been revoked."));
                }
            },
        }));
    },
});

const PauseInvitesForever = definePlugin({
    id: "endcord.pause-invites-forever",
    name: "PauseInvitesForever",
    description: tx("Pause a server's invites with no time limit, which Discord no longer offers, with /pauseinvites"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "pauseinvites",
            description: tx("Pause or resume this server's invites with no time limit"),
            run: async (_, ctx) => {
                const guild = getGuild(ctx.channel.guild_id);
                if (!guild) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const features: string[] = [...(guild.features ?? [])];
                const paused = features.includes("INVITES_DISABLED");
                try {
                    await api("patch", `/guilds/${guild.id}`, {
                        features: paused ? features.filter(f => f !== "INVITES_DISABLED") : [...features, "INVITES_DISABLED"],
                    });
                    botMessage(ctx.channel.id, paused ? t("Invites to {server} are open again.", { server: guild.name }) : t("Invites to {server} are paused until you resume them.", { server: guild.name }));
                } catch (e: any) {
                    botMessage(ctx.channel.id, `❌ ${t("Request failed: {error}", { error: describeError(e) })}`);
                }
            },
        }));
    },
});

// Translate -----------------------------------------------------------------------------------------------------------

interface Translation {
    from: string;
    text: string;
}

export async function translate(text: string, to: string, from = "auto"): Promise<Translation> {
    const query = [
        ["params.client", "gtx"],
        ["dataTypes", "TRANSLATION"],
        ["key", "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA"],
        ["query.sourceLanguage", from],
        ["query.targetLanguage", to],
        ["query.text", text],
    ].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const res = await fetch(`https://translate-pa.googleapis.com/v1/translate?${query}`);
    if (!res.ok) throw new Error(t("Couldn't translate this ({status})", { status: res.status }));
    const data = await res.json();
    return { from: data.sourceLanguage ?? from, text: data.translation ?? "" };
}

/** Discord's language, the default target */
function appLanguage() {
    const locale: string = getStore("LocaleStore")?.locale ?? "en";
    return /^zh/.test(locale) ? locale : locale.split("-")[0];
}

const translations = new Map<string, Translation>();
const channelOf = new Map<string, string>();

const Translate = definePlugin({
    id: "endcord.translate",
    name: "Translate",
    description: tx("Translate messages from the message menu, translate what you send, or use /translate (Google Translate)"),
    authors: [ENDCORD_AUTHOR],
    icon: "LanguageIcon",
    tags: ["Chat", "Utility"],
    settings: {
        receivedOutput: {
            type: "string",
            label: tx("Translate messages to"),
            description: tx("A language code like en, tr, ru, es or fr. Leave empty for Discord's language."),
            placeholder: "en",
            default: "",
        },
        autoTranslate: {
            type: "boolean",
            label: tx("Translate what you send"),
            description: tx("Your messages are translated before they're sent"),
            default: false,
        },
        sentOutput: {
            type: "string",
            label: tx("Translate your messages to"),
            description: tx("Used when \"Translate what you send\" is on"),
            placeholder: "en",
            default: "en",
        },
    },
    start({ store, cleanup }) {
        const target = () => store.receivedOutput.trim() || appLanguage();
        cleanup(
            () => {
                const shown = [...translations.keys()];
                translations.clear();
                for (const id of shown) {
                    const channelId = channelOf.get(id);
                    if (channelId) redrawMessage(channelId, id);
                }
            },
            onMessageRow("translate", (row, message) => {
                const translation = translations.get(message.id);
                if (!translation || !Array.isArray(row.content)) return;
                row.content = [...row.content, textNode(`\n🌐 ${translation.text}\n(${t("translated from {language}", { language: translation.from.toUpperCase() })})`)];
            }),
            addMessageAction({
                key: "translate",
                icon: "LanguageIcon",
                label: message => translations.has(message.id) ? t("Show Original") : t("Translate"),
                visible: message => !!message.content?.trim(),
                onPress: async (message, channel) => {
                    channelOf.set(message.id, channel?.id ?? message.channel_id);
                    if (translations.delete(message.id)) {
                        redrawMessage(message.channel_id, message.id);
                        return;
                    }
                    try {
                        translations.set(message.id, await translate(message.content, target()));
                        redrawMessage(message.channel_id, message.id);
                    } catch (e) {
                        toastError(e);
                    }
                },
            }),
            command({
                name: "translate",
                description: tx("Translate text and send it"),
                options: [
                    { name: "text", description: tx("What to translate"), required: true },
                    { name: "to", description: tx("Language code to translate to, like en or tr"), required: true },
                ],
                run: async ({ text, to }) => (await translate(text, String(to).trim().toLowerCase())).text,
            }),
            onSend("translate", async content => {
                if (!store.autoTranslate || !content.trim() || content.startsWith("/")) return;
                const to = store.sentOutput.trim() || "en";
                const parts = content.split(/(```[\s\S]*?```|`[^`\n]*`|<[@#:a][^>]*>|https?:\/\/\S+)/g);
                const translated = await Promise.all(parts.map((part, i) => i % 2 || !part.trim() ? part : translate(part, to).then(r => r.text).catch(() => part)));
                return translated.join("");
            }, 40),
        );
    },
});

export default [WikiLookup, AvatarGrabber, ServerInfo, InRole, SpotifyShareCommands, HypeSquadSwitcher, FriendInvites, PauseInvitesForever, Translate];
