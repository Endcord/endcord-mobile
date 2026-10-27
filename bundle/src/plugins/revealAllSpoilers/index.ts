/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, onMessageRow, redrawMessage, RowOrder, textNode } from "../hooks";

function unspoil(nodes: any[]): any[] {
    return nodes.flatMap(node => {
        if (node?.type === "spoiler") return Array.isArray(node.content) ? unspoil(node.content) : [textNode(String(node.content ?? ""))];
        if (Array.isArray(node?.content)) return [{ ...node, content: unspoil(node.content) }];
        return [node];
    });
}

export default definePlugin({
    id: "endcord.reveal-all-spoilers",
    name: "RevealAllSpoilers",
    description: tx("Reveal every spoiler in a message from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        const revealed = new Set<string>();
        cleanup(
            () => revealed.clear(),
            onMessageRow("reveal-all-spoilers", (row, message) => {
                if (revealed.has(message.id) && Array.isArray(row.content)) row.content = unspoil(row.content);
            }, RowOrder.ADJUST),
            addMessageAction({
                key: "reveal-all-spoilers",
                icon: "EyeIcon",
                label: () => t("Reveal Spoilers"),
                visible: message => !revealed.has(message.id) && /\|\|[\s\S]+?\|\|/.test(message.content ?? ""),
                onPress: message => {
                    revealed.add(message.id);
                    redrawMessage(message.channel_id, message.id);
                },
            }),
        );
    },
});
