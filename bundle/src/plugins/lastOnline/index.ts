/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { addMessageAction, botMessage, command } from "../hooks";

const lastOnline = wrapSync(createStorage<{ users: Record<string, number>; }>(createMMKVBackend("ENDCORD_LAST_ONLINE", { users: {} })));

function lastSeenText(userId: string): string {
    const status = getStore("PresenceStore")?.getStatus?.(userId);
    if (status && status !== "offline") return t("Online now");
    const at = lastOnline.users?.[userId];
    return at ? t("Last online {time}", { time: new Date(at).toLocaleString() }) : t("Not seen online since Endcord started watching");
}

export default definePlugin({
    id: "endcord.last-online",
    name: "LastOnline",
    description: tx("Remembers when your friends were last online; see it in the message menu or with /lastonline"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Friends"],
    async start({ cleanup }) {
        await awaitStorage(lastOnline);
        cleanup(
            subscribe("PRESENCE_UPDATES", ({ updates }) => {
                const changes: Record<string, number> = {};
                for (const update of updates ?? []) {
                    const id = update.user?.id;
                    if (id && update.status === "offline" && getStore("RelationshipStore")?.isFriend?.(id)) changes[id] = Date.now();
                }
                if (Object.keys(changes).length) lastOnline.users = { ...(lastOnline.users ?? {}), ...changes };
            }),
            addMessageAction({
                key: "last-online",
                icon: "ClockIcon",
                label: message => lastSeenText(message.author?.id),
                visible: message => !!message.author?.id && message.author.id !== currentUserId() && !message.author.bot,
                onPress: () => { },
            }),
            command({
                name: "lastonline",
                description: tx("When was someone last online"),
                options: [{ name: "user", description: tx("Who"), type: "user", required: true }],
                run: ({ user }, ctx) => void botMessage(ctx.channel.id, `<@${user}>: ${lastSeenText(user)}`),
            }),
        );
    },
});
