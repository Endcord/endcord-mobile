/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { Button, Stack, TableRow, TableRowGroup, Text } from "@metro/common/components";
import { View } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, onAction, subscribe } from "../common";

const enum RelationshipType { FRIEND = 1, BLOCKED = 2, INCOMING_REQUEST = 3, OUTGOING_REQUEST = 4 }
const GROUP_DM = 3;

interface Snapshot {
    userId?: string;
    guilds: Record<string, string>;
    groups: Record<string, string>;
    friends: string[];
    requests: string[];
}

interface Notice { text: string; at: number; }

// What the account had the last time Endcord ran, to report removals that happened while it was closed
const snapshot = wrapSync(createStorage<Snapshot & { notices: Notice[]; }>(createMMKVBackend("ENDCORD_RELATIONSHIP_NOTIFIER", {
    guilds: {}, groups: {}, friends: [], requests: [], notices: []
})));

/** Removals the user did themselves, which aren't reported */
const removedByMe = new Set<string>();

const plugin = definePlugin({
    id: "endcord.relationship-notifier",
    name: "RelationshipNotifier",
    description: tx("Notifies you when a friend, group chat, or server removes you."),
    authors: [ENDCORD_AUTHOR],
    popular: 10,
    icon: "FriendsIcon",
    settings: {
        friends: { type: "boolean", label: tx("Friends"), description: tx("Notify when a friend removes you"), default: true },
        friendRequestCancels: { type: "boolean", label: tx("Friend requests"), description: tx("Notify when a friend request is cancelled"), default: true },
        servers: { type: "boolean", label: tx("Servers"), description: tx("Notify when removed from a server"), default: true },
        groups: { type: "boolean", label: tx("Group chats"), description: tx("Notify when removed from a group chat"), default: true },
        offlineRemovals: {
            type: "boolean",
            label: tx("Offline removals"),
            description: tx("Notify you when starting discord if you were removed while offline."),
            default: true,
        },
    },
    async start({ store, cleanup }) {
        await awaitStorage(snapshot);

        const markMine = (id: unknown) => typeof id === "string" && removedByMe.add(id);
        const relationships = findByProps("removeRelationship");
        const guilds = findByProps("leaveGuild");
        const channels = findByProps("closePrivateChannel");
        if (relationships) cleanup(before("removeRelationship", relationships, ([id]) => markMine(id)));
        if (relationships?.cancelFriendRequest) cleanup(before("cancelFriendRequest", relationships, ([id]) => markMine(id)));
        if (relationships?.removeFriend) cleanup(before("removeFriend", relationships, ([id]) => markMine(id)));
        if (guilds) cleanup(before("leaveGuild", guilds, ([id]) => markMine(id)));
        if (channels) cleanup(before("closePrivateChannel", channels, ([id]) => markMine(id)));

        cleanup(
            onAction<{ relationship?: { id: string; type: number; }; }>("RELATIONSHIP_REMOVE", ({ relationship }) => {
                if (!relationship?.id || removedByMe.delete(relationship.id)) return;
                const name = userName(relationship.id);
                if (relationship.type === RelationshipType.FRIEND && store.friends) {
                    notify(t("{user} removed you as a friend.", { user: name }));
                } else if (relationship.type === RelationshipType.INCOMING_REQUEST && store.friendRequestCancels) {
                    notify(t("A friend request from {user} has been removed.", { user: name }));
                }
            }),
            // Before Discord handles it, while the server is still in its stores
            onAction<{ guild?: { id: string; unavailable?: boolean; }; }>("GUILD_DELETE", ({ guild }) => {
                if (!guild?.id || guild.unavailable || removedByMe.delete(guild.id)) return;
                const name = getStore("GuildStore")?.getGuild?.(guild.id)?.name ?? snapshot.guilds[guild.id];
                if (store.servers && name) notify(t("You were removed from the server {server}.", { server: name }));
            }),
            onAction<{ channel?: { id: string; type: number; }; }>("CHANNEL_DELETE", ({ channel }) => {
                if (!channel?.id || channel.type !== GROUP_DM || removedByMe.delete(channel.id)) return;
                const name = groupName(channel.id) ?? snapshot.groups[channel.id];
                if (store.groups && name) notify(t("You were removed from the group {group}.", { group: name }));
            }),
            onAction<{ channelId?: string; user?: { id: string; }; }>("CHANNEL_RECIPIENT_REMOVE", ({ channelId, user }) => {
                if (!channelId || user?.id !== currentUserId() || removedByMe.delete(channelId)) return;
                const name = groupName(channelId) ?? snapshot.groups[channelId];
                if (store.groups && name) notify(t("You were removed from the group {group}.", { group: name }));
            }),
            // Each connection, once Discord has the account's data: report what changed while offline, then save
            // Discord can still be receiving servers right after connecting, so this waits for them to settle
            subscribe("CONNECTION_OPEN", () => setTimeout(checkOffline, 15000)),
            subscribe("RELATIONSHIP_ADD", () => setTimeout(save, 1000)),
            subscribe("GUILD_CREATE", () => setTimeout(save, 1000)),
            subscribe("CHANNEL_CREATE", () => setTimeout(save, 1000)),
        );

        // Already connected when the plugin starts: only remember the current state
        if (currentUserId()) save();
    },
    SettingsComponent: NoticeLog,
});

function userName(id: string) {
    const user = getStore("UserStore")?.getUser?.(id);
    if (!user) return id;
    return user.discriminator && user.discriminator !== "0" ? `${user.username}#${user.discriminator}` : (user.globalName ? `${user.globalName} (@${user.username})` : `@${user.username}`);
}

function groupName(id: string): string | undefined {
    const channel = getStore("ChannelStore")?.getChannel?.(id);
    if (!channel) return undefined;
    if (channel.name) return channel.name;
    const users = (channel.recipients ?? []).map((r: string) => getStore("UserStore")?.getUser?.(r)?.username).filter(Boolean);
    return users.length ? users.join(", ") : undefined;
}

function notify(text: string) {
    showToast(text, findAssetId("CircleInformationIcon-primary"));
    snapshot.notices = [{ text, at: Date.now() }, ...(snapshot.notices ?? [])].slice(0, 50);
}

function current(): Snapshot | null {
    const me = currentUserId();
    if (!me) return null;
    const guildStore = getStore("GuildStore");
    const guildMap = guildStore?.getGuilds?.() ?? {};
    const guilds: Record<string, string> = {};
    for (const guild of Object.values<any>(guildMap)) guilds[guild.id] = guild.name;

    const groups: Record<string, string> = {};
    const channelStore = getStore("ChannelStore");
    for (const id of channelStore?.getPrivateChannelIds?.() ?? []) {
        const channel = channelStore.getChannel(id);
        if (channel?.type === GROUP_DM) groups[id] = groupName(id) ?? id;
    }

    const relationshipStore = getStore("RelationshipStore");
    const all = relationshipStore?.getMutableRelationships?.();
    const entries: Array<[string, number]> = all instanceof Map ? [...all.entries()] : Object.entries(all ?? {}) as any;
    const friends = entries.filter(([, type]) => type === RelationshipType.FRIEND).map(([id]) => id);
    const requests = entries.filter(([, type]) => type === RelationshipType.INCOMING_REQUEST).map(([id]) => id);
    return { userId: me, guilds, groups, friends, requests };
}

function save() {
    const now = current();
    if (!now) return;
    Object.assign(snapshot, now);
}

function checkOffline() {
    const now = current();
    if (!now) return;
    // Not trusted, and not saved, until Discord has the account's servers
    if (!Object.keys(now.guilds).length && Object.keys(snapshot.guilds ?? {}).length > 1) return;
    const { store } = plugin;
    const old = snapshot;
    // A snapshot of another account, or none yet, has nothing to compare
    if (store.offlineRemovals && old.userId === now.userId) {
        const unavailable = getStore("GuildAvailabilityStore");
        if (store.groups) for (const [id, name] of Object.entries(old.groups ?? {})) {
            if (!(id in now.groups)) notify(t("You are no longer in the group {group}.", { group: name }));
        }
        // An empty or mostly missing server list means Discord hasn't finished loading, not that you were removed
        const oldCount = Object.keys(old.guilds ?? {}).length;
        const nowCount = Object.keys(now.guilds).length;
        if (store.servers && nowCount > 0 && nowCount >= oldCount / 2) for (const [id, name] of Object.entries(old.guilds ?? {})) {
            if (!(id in now.guilds) && !unavailable?.isUnavailable?.(id)) notify(t("You are no longer in the server {server}.", { server: name }));
        }
        // Likewise for friends: an empty list right after connecting isn't trusted
        if (store.friends && now.friends.length > 0) for (const id of old.friends ?? []) {
            if (!now.friends.includes(id)) notify(t("You are no longer friends with {user}.", { user: userName(id) }));
        }
        if (store.friendRequestCancels) for (const id of old.requests ?? []) {
            const type = getStore("RelationshipStore")?.getRelationshipType?.(id);
            if (!now.requests.includes(id) && type !== RelationshipType.FRIEND && type !== RelationshipType.BLOCKED && type !== RelationshipType.OUTGOING_REQUEST) {
                notify(t("Friend request from {user} has been revoked.", { user: userName(id) }));
            }
        }
    }
    Object.assign(snapshot, now);
}

function NoticeLog() {
    const data = useProxy(snapshot);
    const notices = data.notices ?? [];

    return <Stack spacing={12}>
        <TableRowGroup title={t("Recent notifications")}>
            {notices.length
                ? notices.map((n, i) => <TableRow key={i} label={n.text} subLabel={new Date(n.at).toLocaleString()} />)
                : <TableRow label={t("No notifications yet")} />}
        </TableRowGroup>
        {notices.length > 0 && <View>
            <Button text={t("Clear")} variant="secondary" size="md" onPress={() => data.notices = []} />
        </View>}
        <Text variant="text-sm/medium" color="text-muted">
            {t("Removals you make yourself are never reported.")}
        </Text>
    </Stack>;
}

export default plugin;
