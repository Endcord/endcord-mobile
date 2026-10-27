/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onMessageRow, RowOrder } from "../hooks";

export default definePlugin({
    id: "endcord.show-me-your-name",
    name: "ShowMeYourName",
    description: tx("Display usernames next to nicks, or no nicks at all"),
    icon: "IdIcon",
    tags: ["Chat"],
    settings: {
        mode: {
            type: "select",
            label: tx("How to display usernames and nicks"),
            default: "nick-user",
            options: [
                { label: tx("Nickname (username)"), value: "nick-user" },
                { label: tx("Username (nickname)"), value: "user-nick" },
                { label: tx("Username only"), value: "user" },
            ],
        },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("show-me-your-name", (row, message) => {
            const username = message.author?.username;
            if (typeof row.username !== "string" || !username || row.username === username) return;
            const nick = row.username;
            row.username = store.mode === "user" ? username : store.mode === "user-nick" ? `${username} (${nick})` : `${nick} (${username})`;
        }, RowOrder.ADJUST));
    },
});
