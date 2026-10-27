/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onMessageRow } from "../hooks";

const BADGES: Array<[number, string]> = [
    [1 << 0, "🛠️"], [1 << 1, "🤝"], [1 << 2, "🎪"], [1 << 3, "🐛"], [1 << 14, "🐞"], [1 << 6, "💜"], [1 << 7, "🧡"], [1 << 8, "💚"],
    [1 << 9, "🎖️"], [1 << 17, "🧰"], [1 << 18, "🛡️"], [1 << 22, "💻"],
];

export default definePlugin({
    id: "endcord.show-badges-in-chat",
    name: "ShowBadgesInChat",
    description: tx("Shows the message author's badges beside their name in chat."),
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
