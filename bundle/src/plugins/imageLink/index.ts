/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onMessageRow, RowOrder, textNode } from "../hooks";

export default definePlugin({
    id: "endcord.image-link",
    name: "ImageLink",
    description: tx("Never hide image links in messages, even if it's the only content"),
    icon: "LinkIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        cleanup(onMessageRow("image-link", (row, message) => {
            const content = String(message.content ?? "").trim();
            if (!/^https?:\/\/\S+$/.test(content)) return;
            const shown = Array.isArray(row.content) && row.content.some((n: any) => n && (n.type !== "text" || String(n.content ?? "").trim()));
            if (!shown) row.content = [textNode(content)];
        }, RowOrder.REPLACE));
    },
});
