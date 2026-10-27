/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { currentUserId, subscribe } from "../common";
import { copy, displayName, getChannel, getGuild, getUser } from "../hooks";
import LogList from "../ui/LogList";

interface Remembered {
    id: string;
    username: string;
    name: string;
    lastSeen: number;
    where: string;
}

const people = wrapSync(createStorage<{ users: Record<string, Remembered>; }>(createMMKVBackend("ENDCORD_I_REMEMBER_YOU", { users: {} })));

function PeopleList() {
    useProxy(people);
    const users = Object.values(people.users ?? {}).sort((a, b) => b.lastSeen - a.lastSeen);
    return <LogList
        title={t("People You've Talked To")}
        empty={t("People you message and who message you will be listed here")}
        entries={users.slice(0, 300).map(u => ({
            key: u.id,
            label: `${u.name} (@${u.username})`,
            subLabel: `${u.where} · ${new Date(u.lastSeen).toLocaleDateString()}`,
            onPress: () => copy(u.id, t("User ID copied")),
        }))}
        onClear={() => void (people.users = {})}
    />;
}

export default definePlugin({
    id: "endcord.i-remember-you",
    name: "IRememberYou",
    description: tx("Remembers everyone you talk to in DMs and servers, on your device, so you can always find them again"),
    icon: "FriendsIcon",
    tags: ["Friends", "Utility"],
    SettingsComponent: PeopleList,
    async start({ cleanup }) {
        await awaitStorage(people);
        // Saved together a few seconds later, so a conversation doesn't rewrite the whole list for every message
        let pending: Record<string, Remembered> = {};
        let timer: ReturnType<typeof setTimeout> | undefined;
        const save = () => {
            clearTimeout(timer);
            timer = undefined;
            if (!Object.keys(pending).length) return;
            people.users = { ...(people.users ?? {}), ...pending };
            pending = {};
        };
        const remember = (user: any, channelId: string) => {
            if (!user?.id || user.bot || user.id === currentUserId()) return;
            const channel = getChannel(channelId);
            const where = channel?.guild_id ? getGuild(channel.guild_id)?.name ?? t("A server") : t("Direct Message");
            pending[user.id] = { id: user.id, username: user.username, name: displayName(user), lastSeen: Date.now(), where };
            timer ??= setTimeout(save, 5000);
        };
        cleanup(save, subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            if (optimistic || !message?.author) return;
            const me = currentUserId();
            const channel = getChannel(message.channel_id);
            const isDm = channel && !channel.guild_id;
            // People in DMs, and people in servers who reply to you or mention you
            const toMe = message.referenced_message?.author?.id === me || (message.mentions ?? []).some((u: any) => (u?.id ?? u) === me);
            if (message.author.id === me) {
                if (isDm) for (const id of channel.recipients ?? []) remember(getUser(id), message.channel_id);
                else if (message.referenced_message?.author) remember(message.referenced_message.author, message.channel_id);
            } else if (isDm || toMe) {
                remember(message.author, message.channel_id);
            }
        }));
    },
});
