/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import formatDate from "@lib/utils/formatDate";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { appendToTimestamp, onMessageRow, snowflakeTime } from "../hooks";

export default definePlugin({
    id: "endcord.reply-timestamp",
    name: "ReplyTimestamp",
    description: tx("Shows when the message a reply answers was sent, next to the reply's time"),
    authors: [ENDCORD_AUTHOR],
    icon: "ArrowAngleLeftUpIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("reply-timestamp", (row, message) => {
            const id = message.messageReference?.message_id ?? message.message_reference?.message_id;
            if (!id || !/^\d+$/.test(id)) return;
            const time = new Date(snowflakeTime(id));
            const today = time.toDateString() === new Date().toDateString();
            const text = today
                ? formatDate(time, { hour: "2-digit", minute: "2-digit" })
                : formatDate(time, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            appendToTimestamp(row, ` · ↩ ${text}`);
        }));
    },
});
