/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId } from "../common";
import { api, botMessage, command, deleteMessage } from "../hooks";
import { sleep } from "../shared/tools";

/** Your messages in a channel, newest first, reading back up to `limit` messages */
async function myMessages(channelId: string, limit: number) {
    const mine: any[] = [];
    let before: string | undefined;
    let read = 0;
    while (read < limit) {
        const page: any[] = await api("get", `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`);
        if (!Array.isArray(page) || !page.length) break;
        read += page.length;
        mine.push(...page.filter(m => m.author?.id === currentUserId()));
        before = page[page.length - 1].id;
        if (page.length < 100) break;
    }
    return mine;
}

export default definePlugin({
    id: "endcord.clear-my-messages",
    name: "ClearMyMessages",
    description: tx("Delete your recent messages in a channel with /clearmessages"),
    authors: [ENDCORD_AUTHOR],
    icon: "TrashIcon",
    tags: ["Privacy", "Chat"],
    start({ cleanup }) {
        let running = false;
        cleanup(command({
            name: "clearmessages",
            description: tx("Delete your recent messages in this channel"),
            options: [{ name: "count", description: tx("How many of your messages (up to 200)"), type: "integer", required: true }],
            run: async ({ count }, ctx) => {
                if (running) {
                    botMessage(ctx.channel.id, t("Already deleting messages; wait for it to finish."));
                    return;
                }
                running = true;
                try {
                    const wanted = Math.min(Math.max(Number(count) || 0, 1), 200);
                    const mine = (await myMessages(ctx.channel.id, 1000)).slice(0, wanted);
                    botMessage(ctx.channel.id, t("Deleting {count} of your messages…", { count: mine.length }));
                    for (const message of mine) {
                        await Promise.resolve(deleteMessage(ctx.channel.id, message.id)).catch(() => { });
                        // Discord limits deletes to about one a second
                        await sleep(1100);
                    }
                    botMessage(ctx.channel.id, t("Deleted {count} messages.", { count: mine.length }));
                } finally {
                    running = false;
                }
            },
        }));
    },
});
