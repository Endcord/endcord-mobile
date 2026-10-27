/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { onMessageRow } from "../hooks";

export default definePlugin({
    id: "endcord.fake-tag",
    name: "FakeTag",
    description: tx("Adds a fake clan tag and badge emoji next to your username. Client-side only."),
    icon: "TagIcon",
    tags: ["Customisation", "Fun"],
    settings: {
        tag: { type: "string", label: tx("Tag"), description: tx("Tag text (up to 5 chars, auto-uppercased)."), default: "ECRD" },
        badgeUrl: { type: "string", label: tx("Badge image"), description: tx("Badge image URL (e.g. https://cdn.discordapp.com/emojis/ID.png)."), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("fake-tag", (row, message) => {
            const tag = store.tag.trim().slice(0, 5).toUpperCase();
            if (message.author?.id !== currentUserId() || !tag) return;
            row.clanTag = tag;
            row.clanTagGuildId ??= "0";
            if (store.badgeUrl.trim()) row.clanBadgeUrl = store.badgeUrl.trim();
        }));
    },
});
