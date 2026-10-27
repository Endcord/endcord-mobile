/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { onMessageRow } from "../hooks";
import { prependToTimestamp } from "../shared/rows";

// Days of friendship and the badge for them
const RANKS: Array<[number, string]> = [[365 * 5, "💎"], [365 * 2, "🏆"], [365, "⭐"], [180, "🌳"], [30, "🌿"], [0, "🌱"]];

export default definePlugin({
    id: "endcord.friendship-ranks",
    name: "FriendshipRanks",
    description: tx("Adds badges showcasing how long you have been friends with a user for"),
    icon: "FriendsIcon",
    tags: ["Friends", "Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("friendship-ranks", (row, message) => {
            const since = getStore("RelationshipStore")?.getSince?.(message.author?.id);
            if (!since) return;
            const days = (Date.now() - Date.parse(since)) / 86_400_000;
            const rank = RANKS.find(([min]) => days >= min);
            if (rank) prependToTimestamp(row, `${rank[1]} `);
        }));
    },
});
