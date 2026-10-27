/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Friends and the people you talk to: requests, blocks, tags, nicknames, profiles and streaks.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { after } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { safeFetch } from "@lib/utils";
import { findByProps } from "@metro";
import { Stack, TextInput } from "@metro/common/components";
import { useEffect, useState } from "react";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { addMessageAction, api, botMessage, command, copy, describeError, displayName, getChannel, getUser, jumpTo, localDay, onMessageRow, openUrl, redrawChannel, redrawMessage, RowOrder } from "../hooks";
import { avatarUrl } from "../lookup";
import { choose, prompt, showText } from "../ui/dialogs";
import LogList from "../ui/LogList";

// Discord's relationship types
const FRIEND = 1, BLOCKED = 2, INCOMING = 3, OUTGOING = 4;

function relationships(): Array<[string, number]> {
    const all = getStore("RelationshipStore")?.getMutableRelationships?.() ?? {};
    return all instanceof Map ? [...all.entries()] : Object.entries(all).map(([id, type]) => [id, typeof type === "object" ? (type as any).type : Number(type)]);
}

const since = (id: string) => Date.parse(getStore("RelationshipStore")?.getSince?.(id) ?? "") || 0;
const nameOf = (id: string) => {
    const user = getUser(id);
    return user ? `${displayName(user)} (@${user.username})` : id;
};
const removeRelationship = (id: string) => {
    const actions = findByProps("removeRelationship");
    return actions?.removeRelationship ? Promise.resolve(actions.removeRelationship(id)) : api("del", `/users/@me/relationships/${id}`);
};
const failed = (e: any) => showToast(t("Request failed: {error}", { error: describeError(e) }), findAssetId("CircleXIcon-primary"));

/** Rerenders when relationships change */
function useRelationships() {
    const [, update] = useState(0);
    useEffect(() => {
        const store = getStore("RelationshipStore");
        const listener = () => update(n => n + 1);
        store?.addChangeListener?.(listener);
        return () => store?.removeChangeListener?.(listener);
    }, []);
    return relationships();
}

// BetterBlockedUsers ---------------------------------------------------------------------------------------------------

function BlockedPage() {
    const all = useRelationships();
    const [query, setQuery] = useState("");
    const blocked = all.filter(([, type]) => type === BLOCKED).map(([id]) => id)
        .filter(id => !query || nameOf(id).toLowerCase().includes(query.toLowerCase()) || id.includes(query));
    return <Stack spacing={8}>
        <TextInput placeholder={t("Search")} value={query} onChange={setQuery} isClearable={true} />
        <LogList
            title={t("Blocked Users")}
            empty={t("Nobody is blocked")}
            entries={blocked.map(id => ({
                key: id,
                label: nameOf(id),
                subLabel: id,
                onPress: () => choose(nameOf(id), [{ label: t("Unblock"), value: "unblock", icon: "TrashIcon", danger: true }, { label: t("Copy User ID"), value: "copy", icon: "CopyIcon" }],
                    action => action === "unblock" ? removeRelationship(id).catch(failed) : copy(id)),
            }))}
        />
    </Stack>;
}

const BetterBlockedUsers = definePlugin({
    id: "endcord.better-blocked-users",
    name: "BetterBlockedUsers",
    description: tx("A searchable list of the people you blocked, to unblock them in one tap"),
    authors: [ENDCORD_AUTHOR],
    icon: "DenyIcon",
    tags: ["Friends", "Privacy"],
    SettingsComponent: BlockedPage,
    start() { },
});

// CancelFriendRequest / SortFriendRequests -----------------------------------------------------------------------------

function OutgoingPage() {
    const outgoing = useRelationships().filter(([, type]) => type === OUTGOING).map(([id]) => id).sort((a, b) => since(b) - since(a));
    return <LogList
        title={t("Sent Friend Requests")}
        empty={t("You have no pending friend requests")}
        entries={outgoing.map(id => ({
            key: id,
            label: nameOf(id),
            subLabel: since(id) ? new Date(since(id)).toLocaleString() : undefined,
            onPress: () => choose(nameOf(id), [{ label: t("Cancel Friend Request"), value: "cancel", icon: "TrashIcon", danger: true }], () => removeRelationship(id).catch(failed)),
        }))}
    />;
}

const CancelFriendRequest = definePlugin({
    id: "endcord.cancel-friend-request",
    name: "CancelFriendRequest",
    description: tx("See the friend requests you sent and cancel them"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserPlusIcon",
    tags: ["Friends"],
    SettingsComponent: OutgoingPage,
    start() { },
});

const CancelFriendRequestNC = definePlugin({
    id: "endcord.cancel-friend-request-nc",
    name: "CancelFriendRequestNC",
    description: tx("Cancel every friend request you sent with /cancelrequests"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserPlusIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        cleanup(command({
            name: "cancelrequests",
            description: tx("Cancel all the friend requests you sent"),
            run: async (_, ctx) => {
                const outgoing = relationships().filter(([, type]) => type === OUTGOING).map(([id]) => id);
                for (const id of outgoing) {
                    await removeRelationship(id).catch(() => { });
                    await new Promise(r => setTimeout(r, 600));
                }
                botMessage(ctx.channel.id, t("Cancelled {count} friend requests.", { count: outgoing.length }));
            },
        }));
    },
});

function IncomingPage() {
    const incoming = useRelationships().filter(([, type]) => type === INCOMING).map(([id]) => id).sort((a, b) => since(b) - since(a));
    return <LogList
        title={t("Friend Requests, Newest First")}
        empty={t("You have no friend requests")}
        entries={incoming.map(id => ({
            key: id,
            label: nameOf(id),
            subLabel: since(id) ? new Date(since(id)).toLocaleString() : undefined,
            onPress: () => choose(nameOf(id), [
                { label: t("Accept"), value: "accept", icon: "CheckmarkLargeIcon" },
                { label: t("Ignore"), value: "ignore", icon: "TrashIcon", danger: true },
            ], action => action === "accept"
                ? api("put", `/users/@me/relationships/${id}`, {}).catch(failed)
                : removeRelationship(id).catch(failed)),
        }))}
    />;
}

const SortFriendRequests = definePlugin({
    id: "endcord.sort-friend-requests",
    name: "SortFriendRequests",
    description: tx("Your incoming friend requests, newest first, to accept or ignore in the plugin's settings"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserPlusIcon",
    tags: ["Friends"],
    SettingsComponent: IncomingPage,
    start() { },
});

// FriendTags -----------------------------------------------------------------------------------------------------------

const friendTags = wrapSync(createStorage<{ users: Record<string, string[]>; }>(createMMKVBackend("ENDCORD_FRIEND_TAGS", { users: {} })));

function FriendTagsPage() {
    useProxy(friendTags);
    const byTag = new Map<string, string[]>();
    for (const [id, tags] of Object.entries(friendTags.users ?? {})) for (const tag of tags) byTag.set(tag, [...byTag.get(tag) ?? [], id]);
    return <LogList
        title={t("Friend Tags")}
        empty={t("Long-press a friend's message and choose Tag Friend")}
        entries={[...byTag.entries()].sort().map(([tag, users]) => ({ key: tag, label: `#${tag}`, subLabel: users.map(nameOf).join(", ") }))}
    />;
}

const FriendTags = definePlugin({
    id: "endcord.friend-tags",
    name: "FriendTags",
    description: tx("Give friends your own tags and list everyone with a tag with /friendtag"),
    authors: [ENDCORD_AUTHOR],
    icon: "TagIcon",
    tags: ["Friends"],
    SettingsComponent: FriendTagsPage,
    async start({ cleanup }) {
        await awaitStorage(friendTags);
        cleanup(
            addMessageAction({
                key: "friend-tags",
                icon: "TagIcon",
                label: () => t("Tag Friend"),
                visible: message => !!getStore("RelationshipStore")?.isFriend?.(message.author?.id),
                onPress: message => prompt({
                    title: t("Tags for {user}", { user: displayName(message.author) }),
                    description: t("Separate tags with commas"),
                    initial: (friendTags.users?.[message.author.id] ?? []).join(", "),
                    allowEmpty: true,
                    onSubmit: value => {
                        const tags = [...new Set(value.split(",").map(s => s.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))];
                        const users = { ...(friendTags.users ?? {}) };
                        if (tags.length) users[message.author.id] = tags;
                        else delete users[message.author.id];
                        friendTags.users = users;
                    },
                }),
            }),
            command({
                name: "friendtag",
                description: tx("List the friends with a tag (only you see it)"),
                options: [{ name: "tag", description: tx("The tag"), required: true }],
                run: ({ tag }, ctx) => {
                    const wanted = String(tag).trim().toLowerCase().replace(/^#/, "");
                    const users = Object.entries(friendTags.users ?? {}).filter(([, tags]) => tags.includes(wanted)).map(([id]) => `<@${id}>`);
                    botMessage(ctx.channel.id, users.length ? `#${wanted}: ${users.join(", ")}` : t("No friends have the tag #{tag}.", { tag: wanted }));
                },
            }),
        );
    },
});

// FriendNicknames ------------------------------------------------------------------------------------------------------

const nicknames = wrapSync(createStorage<{ users: Record<string, string>; }>(createMMKVBackend("ENDCORD_FRIEND_NICKNAMES", { users: {} })));

const FriendNicknames = definePlugin({
    id: "endcord.friend-nicknames",
    name: "FriendNicknames",
    description: tx("Give people your own nicknames that only you see in chat"),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Friends", "Customisation"],
    async start({ cleanup }) {
        await awaitStorage(nicknames);
        cleanup(
            onMessageRow("friend-nicknames", (row, message) => {
                const nick = nicknames.users?.[message.author?.id];
                if (!nick) return;
                if (typeof row.username === "string") row.username = nick;
                else if (typeof row.timestamp === "string" && !row.timestamp.startsWith(`${nick} · `)) row.timestamp = `${nick} · ${row.timestamp}`;
            }, RowOrder.REPLACE),
            addMessageAction({
                key: "friend-nicknames",
                icon: "IdIcon",
                label: () => t("Set Your Nickname for Them"),
                visible: message => !!message.author?.id && message.author.id !== currentUserId(),
                onPress: message => prompt({
                    title: t("Your nickname for {user}", { user: displayName(message.author) }),
                    description: t("Only you see it. Leave it empty to remove it."),
                    initial: nicknames.users?.[message.author.id] ?? "",
                    allowEmpty: true,
                    onSubmit: value => {
                        const users = { ...(nicknames.users ?? {}) };
                        if (value.trim()) users[message.author.id] = value.trim().slice(0, 32);
                        else delete users[message.author.id];
                        nicknames.users = users;
                        redrawChannel();
                    },
                }),
            }),
        );
    },
});

// Profiles: connections, GitHub, media, activities ---------------------------------------------------------------------

async function profileOf(userId: string): Promise<any> {
    const cached = getStore("UserProfileStore")?.getUserProfile?.(userId);
    if (cached?.connectedAccounts) return cached;
    return api("get", `/users/${userId}/profile?with_mutual_guilds=false`);
}

const accountsOf = (profile: any): any[] => profile?.connectedAccounts ?? profile?.connected_accounts ?? [];

const ShowConnections = definePlugin({
    id: "endcord.show-connections",
    name: "ShowConnections",
    description: tx("See the accounts a message's author has connected (GitHub, Steam, Spotify...) from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "show-connections",
            icon: "LinkIcon",
            label: () => t("Connections"),
            visible: message => !!message.author?.id && !message.author.bot,
            onPress: async message => {
                try {
                    const accounts = accountsOf(await profileOf(message.author.id));
                    showText(t("Connections of {user}", { user: displayName(message.author) }), accounts.length
                        ? accounts.map(a => `${a.type}: ${a.name}${a.verified ? " ✓" : ""}`).join("\n")
                        : t("No connected accounts are shown."));
                } catch (e) {
                    failed(e);
                }
            },
        }));
    },
});

const GitHubRepos = definePlugin({
    id: "endcord.github-repos",
    name: "GitHubRepos",
    description: tx("See the public GitHub repositories of a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaperIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "github-repos",
            icon: "PaperIcon",
            label: () => t("GitHub Repositories"),
            visible: message => !!message.author?.id && !message.author.bot,
            onPress: async message => {
                try {
                    const github = accountsOf(await profileOf(message.author.id)).find(a => a.type === "github");
                    if (!github) {
                        showToast(t("{user} hasn't connected GitHub", { user: displayName(message.author) }), findAssetId("CircleInformationIcon-primary"));
                        return;
                    }
                    const repos: any[] = await safeFetch(`https://api.github.com/users/${encodeURIComponent(github.name)}/repos?sort=updated&per_page=30`).then(r => r.json());
                    choose(`${github.name} · GitHub`, (Array.isArray(repos) ? repos : []).filter(r => !r.fork).map(r => ({
                        label: r.name,
                        subLabel: `★ ${r.stargazers_count}${r.language ? ` · ${r.language}` : ""}${r.description ? ` · ${r.description}` : ""}`.slice(0, 120),
                        value: r.html_url as string,
                    })), openUrl);
                } catch (e) {
                    failed(e);
                }
            },
        }));
    },
});

const ProfileMedia = definePlugin({
    id: "endcord.profile-media",
    name: "ProfileMedia",
    description: tx("Open a message author's avatar and banner in full resolution from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ImageIcon",
    tags: ["Media", "Friends"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "profile-media",
            icon: "ImageIcon",
            label: () => t("Avatar and Banner"),
            visible: message => !!message.author?.id,
            onPress: async message => {
                const user = message.author;
                const choices = [{ label: t("Open Avatar"), value: avatarUrl(user, 4096), icon: "UserCircleIcon" }];
                try {
                    const profile = await profileOf(user.id);
                    const banner = profile?.banner ?? profile?.user?.banner ?? user.banner;
                    if (banner) choices.push({ label: t("Open Banner"), value: `https://cdn.discordapp.com/banners/${user.id}/${banner}.${banner.startsWith("a_") ? "gif" : "png"}?size=4096`, icon: "ImageIcon" });
                } catch { }
                choose(displayName(user), choices, openUrl);
            },
        }));
    },
});

const ACTIVITY_VERBS = [tx("Playing"), tx("Streaming"), tx("Listening to"), tx("Watching"), "", tx("Competing in")];

const BetterActivities = definePlugin({
    id: "endcord.better-activities",
    name: "BetterActivities",
    description: tx("See everything a message's author is doing right now, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "GameControllerIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        const activities = (id?: string): any[] => (id && getStore("PresenceStore")?.getActivities?.(id)) || [];
        cleanup(addMessageAction({
            key: "better-activities",
            icon: "GameControllerIcon",
            label: () => t("Activities"),
            visible: message => activities(message.author?.id).length > 0,
            onPress: message => showText(t("Activities of {user}", { user: displayName(message.author) }), activities(message.author.id).map(a => {
                if (a.type === 4) return `💬 ${[a.emoji?.name, a.state].filter(Boolean).join(" ")}`;
                const verb = ACTIVITY_VERBS[a.type] ? `${t(ACTIVITY_VERBS[a.type])} ` : "";
                const started = a.timestamps?.start ? ` · ${t("for {time}", { time: Math.round((Date.now() - a.timestamps.start) / 60000) + "m" })}` : "";
                return [`${verb}**${a.name}**${started}`, a.details, a.state].filter(Boolean).join("\n");
            }).join("\n\n")),
        }));
    },
});

const ShowSongName = definePlugin({
    id: "endcord.show-song-name",
    name: "ShowSongName",
    description: tx("Shows song name instead of artist for Spotify activity"),
    authors: [ENDCORD_AUTHOR],
    icon: "MusicIcon",
    tags: ["Friends", "Media"],
    start({ cleanup }) {
        const presences = getStore("PresenceStore");
        if (typeof presences?.getActivities !== "function") throw new Error("Discord's presence store wasn't found");
        // Kept per list Discord returns, so screens see the same list (and activities) until the song changes
        const renamed = new WeakMap<object, any[]>();
        cleanup(after("getActivities", presences, (_, result: any[]) => {
            if (!Array.isArray(result) || !result.some(a => a?.type === 2 && a.name === "Spotify" && a.details)) return result;
            if (!renamed.has(result)) renamed.set(result, result.map(a => a?.type === 2 && a.name === "Spotify" && a.details ? { ...a, name: a.details } : a));
            return renamed.get(result);
        }));
    },
});

// PronounDB ------------------------------------------------------------------------------------------------------------

const PRONOUNS: Record<string, string> = { he: "he/him", she: "she/her", it: "it/its", they: "they/them", any: tx("any pronouns"), ask: tx("ask me"), avoid: tx("use my name"), other: tx("other pronouns") };

const PronounDB = definePlugin({
    id: "endcord.pronoundb",
    name: "PronounDB",
    description: tx("Shows people's pronouns from PronounDB next to their messages"),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Chat", "Friends"],
    settings: {
        discordFirst: { type: "boolean", label: tx("Prefer Discord's pronouns"), description: tx("Use the pronouns in someone's Discord profile when they've set them"), default: true },
    },
    start({ store, cleanup }) {
        const cache = new Map<string, string | null>();
        const queue = new Map<string, Set<string>>();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const flush = async () => {
            timer = undefined;
            const batch = [...queue.entries()].slice(0, 50);
            for (const [id] of batch) queue.delete(id);
            try {
                const data = await safeFetch(`https://pronoundb.org/api/v2/lookup?platform=discord&ids=${batch.map(([id]) => id).join(",")}`).then(r => r.json());
                for (const [id, messages] of batch) {
                    const set: string[] = data?.[id]?.sets?.en ?? [];
                    cache.set(id, set.length ? set.length === 1 ? PRONOUNS[set[0]] ?? set[0] : set.join("/") : null);
                    for (const key of messages) {
                        const [channelId, messageId] = key.split(":");
                        redrawMessage(channelId, messageId);
                    }
                }
            } catch {
                for (const [id] of batch) cache.set(id, null);
            }
            if (queue.size) timer = setTimeout(flush, 2000);
        };
        cleanup(() => clearTimeout(timer), onMessageRow("pronoundb", (row, message) => {
            const id = message.author?.id;
            if (!id || message.author.bot || typeof row.timestamp !== "string") return;
            if (store.discordFirst && getStore("UserProfileStore")?.getUserProfile?.(id)?.pronouns) return;
            const pronouns = cache.get(id);
            if (pronouns === undefined) {
                queue.set(id, (queue.get(id) ?? new Set()).add(`${message.channel_id}:${message.id}`));
                timer ??= setTimeout(flush, 500);
                return;
            }
            if (pronouns && !row.timestamp.startsWith(t(pronouns))) row.timestamp = `${t(pronouns)} · ${row.timestamp}`;
        }));
    },
});

// Streaks --------------------------------------------------------------------------------------------------------------

interface Streak {
    day: string;
    mine: boolean;
    theirs: boolean;
    count: number;
    last?: string;
}

const streaks = wrapSync(createStorage<{ users: Record<string, Streak>; }>(createMMKVBackend("ENDCORD_STREAKS", { users: {} })));
const dayOf = (ms: number) => localDay(ms);
const current = (s?: Streak) => {
    if (!s?.last) return 0;
    const today = dayOf(Date.now()), yesterday = dayOf(Date.now() - 86_400_000);
    return s.last === today || s.last === yesterday ? s.count : 0;
};

const Streaks = definePlugin({
    id: "endcord.streaks",
    name: "Streaks",
    description: tx("Shows a streak next to a user when you exchange DMs with them on consecutive days."),
    authors: [ENDCORD_AUTHOR],
    icon: "StarIcon",
    tags: ["Friends", "Fun"],
    settings: {
        minimum: { type: "number", label: tx("Shortest streak shown"), description: tx("Streaks shorter than this many days aren't shown"), default: 2, min: 1, max: 365 },
    },
    async start({ store, cleanup }) {
        await awaitStorage(streaks);
        cleanup(
            subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
                const channel = message && getChannel(message.channel_id);
                if (!channel || channel.type !== 1 || optimistic) return;
                const other: string | undefined = channel.recipients?.[0];
                if (!other || message.author?.bot) return;
                const today = dayOf(Date.now());
                const before = streaks.users?.[other];
                const s: Streak = before?.day === today ? { ...before } : { ...(before ?? { count: 0 }), day: today, mine: false, theirs: false };
                if (message.author?.id === currentUserId()) s.mine = true;
                else s.theirs = true;
                if (s.mine && s.theirs && s.last !== today) {
                    s.count = s.last === dayOf(Date.now() - 86_400_000) ? s.count + 1 : 1;
                    s.last = today;
                }
                // Most messages of a day change nothing, and aren't worth a write
                if (before && JSON.stringify(before) === JSON.stringify(s)) return;
                streaks.users = { ...(streaks.users ?? {}), [other]: s };
            }),
            onMessageRow("streaks", (row, message) => {
                const channel = getChannel(message.channel_id);
                if (channel?.type !== 1 || message.author?.id === currentUserId() || typeof row.timestamp !== "string") return;
                const count = current(streaks.users?.[message.author?.id]);
                if (count >= store.minimum && !row.timestamp.startsWith("🔥")) row.timestamp = `🔥${count} ${row.timestamp}`;
            }),
        );
    },
});

// WhoReacted / MutualGroupDMs ------------------------------------------------------------------------------------------

const WhoReacted = definePlugin({
    id: "endcord.who-reacted",
    name: "WhoReacted",
    description: tx("See who reacted to a message with each emoji, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "who-reacted",
            icon: "ReactionIcon",
            label: () => t("Who Reacted"),
            visible: message => (message.reactions?.length ?? 0) > 0,
            onPress: async message => {
                try {
                    const parts = await Promise.all((message.reactions as any[]).slice(0, 10).map(async r => {
                        const emoji = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name;
                        const users: any[] = await api("get", `/channels/${message.channel_id}/messages/${message.id}/reactions/${encodeURIComponent(emoji)}?limit=100`);
                        return `${r.emoji.id ? `:${r.emoji.name}:` : r.emoji.name} ${r.count}\n${users.map(u => u.global_name ?? u.username).join(", ")}`;
                    }));
                    showText(t("Who Reacted"), parts.join("\n\n"));
                } catch (e) {
                    failed(e);
                }
            },
        }));
    },
});

const MutualGroupDMs = definePlugin({
    id: "endcord.mutual-group-dms",
    name: "MutualGroupDMs",
    description: tx("See the group DMs you share with a message's author, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "GroupIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        const groupsWith = (userId: string) => (getStore("PrivateChannelSortStore")?.getPrivateChannelIds?.() ?? [])
            .map((id: string) => getChannel(id))
            .filter((c: any) => c?.type === 3 && c.recipients?.includes(userId));
        cleanup(addMessageAction({
            key: "mutual-group-dms",
            icon: "GroupIcon",
            label: () => t("Mutual Group DMs"),
            visible: message => !!message.author?.id && message.author.id !== currentUserId() && groupsWith(message.author.id).length > 0,
            onPress: message => choose(t("Mutual Group DMs"), groupsWith(message.author.id).map((c: any) => ({
                label: c.name || c.recipients.map((id: string) => displayName(getUser(id) ?? { id })).join(", "),
                value: c.id as string,
            })), (id: string) => {
                const last = getChannel(id)?.lastMessageId;
                if (last) jumpTo(id, last);
            }),
        }));
    },
});

export default [
    BetterBlockedUsers, CancelFriendRequest, CancelFriendRequestNC, SortFriendRequests, FriendTags, FriendNicknames,
    ShowConnections, GitHubRepos, ProfileMedia, BetterActivities, ShowSongName, PronounDB, Streaks, WhoReacted, MutualGroupDMs,
];
