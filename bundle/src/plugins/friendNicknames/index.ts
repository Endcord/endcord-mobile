/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId } from "../common";
import { addMessageAction, displayName, onMessageRow, redrawChannel, RowOrder } from "../hooks";
import { prompt } from "../ui/dialogs";

const nicknames = wrapSync(createStorage<{ users: Record<string, string>; }>(createMMKVBackend("ENDCORD_FRIEND_NICKNAMES", { users: {} })));

export default definePlugin({
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
