/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { api, displayName, onMessageRow, parseMessageLink, redrawMessage, textNode } from "../hooks";
import { preview } from "../shared/messages";

export default definePlugin({
    id: "endcord.message-link-embeds",
    name: "MessageLinkEmbeds",
    description: tx("Adds a preview to messages that link another message"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        // Linked message ID to its preview, or null while it's loading or when it can't be seen
        const previews = new Map<string, string | null>();
        const describe = (m: any) => `${displayName(m.author)}: ${preview(m.content || (m.attachments?.length ? t("Sent an attachment") : ""), 160)}`;
        cleanup(onMessageRow("message-link-embeds", (row, message) => {
            const link = parseMessageLink(String(message.content ?? ""));
            if (!link || !Array.isArray(row.content) || link.messageId === message.id) return;
            let text = previews.get(link.messageId);
            if (text === undefined) {
                const stored = getStore("MessageStore")?.getMessage?.(link.channelId, link.messageId);
                if (stored) previews.set(link.messageId, text = describe(stored));
                else {
                    previews.set(link.messageId, null);
                    api("get", `/channels/${link.channelId}/messages?around=${link.messageId}&limit=1`)
                        .then(([found]: any[]) => {
                            if (found?.id !== link.messageId) return;
                            previews.set(link.messageId, describe({ ...found, author: { ...found.author, globalName: found.author?.global_name } }));
                            redrawMessage(message.channel_id, message.id);
                        })
                        .catch(() => { });
                }
            }
            if (text) row.content = [...row.content, textNode(`\n↪ ${text}`)];
        }));
    },
});
