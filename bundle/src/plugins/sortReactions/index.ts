/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onIncomingMessage, onMessageRow } from "../hooks";

const byCount = (a: any, b: any) => (b?.count ?? 0) - (a?.count ?? 0);

export default definePlugin({
    id: "endcord.sort-reactions",
    name: "SortReactions",
    description: tx("Sorts reactions by count in chat."),
    icon: "ReactionIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(
            onIncomingMessage("sort-reactions", message => {
                const { reactions } = message;
                if (!Array.isArray(reactions) || reactions.length < 2) return;
                return { ...message, reactions: [...reactions].sort(byCount) };
            }),
            // Reactions added while the chat is open
            onMessageRow("sort-reactions", row => {
                if (Array.isArray(row.reactions) && row.reactions.length > 1 && typeof row.reactions[0]?.count === "number") row.reactions = [...row.reactions].sort(byCount);
            }),
        );
    },
});
