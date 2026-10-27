/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { api, botMessage, command, getChannel, jumpTo, loadedMessages } from "../hooks";

export default definePlugin({
    id: "endcord.jump-to",
    name: "JumpTo",
    description: tx("Jump to the first or the latest message of a chat with /jumpto"),
    authors: [ENDCORD_AUTHOR],
    icon: "ArrowAngleLeftUpIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(command({
            name: "jumpto",
            description: tx("Jump to the start or the end of this chat"),
            options: [{ name: "where", description: tx("Where to go"), required: true, choices: [{ name: t("First message"), value: "first" }, { name: t("Latest message"), value: "last" }] }],
            run: async ({ where }, ctx) => {
                const channelId = ctx.channel.id;
                if (where === "last") {
                    const last = getChannel(channelId)?.lastMessageId ?? loadedMessages(channelId).at(-1)?.id;
                    if (last) jumpTo(channelId, last);
                    return;
                }
                const [first] = await api("get", `/channels/${channelId}/messages?after=0&limit=1`);
                if (first?.id) jumpTo(channelId, first.id);
                else botMessage(channelId, t("This chat has no messages."));
            },
        }));
    },
});
