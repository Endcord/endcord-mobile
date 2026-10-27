/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import formatDate from "@lib/utils/formatDate";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onMessageRow, RowOrder } from "../hooks";
import { timeOf } from "../shared/rows";

export default definePlugin({
    id: "endcord.realtime-timestamps",
    name: "RealtimeTimestamps",
    description: tx("Shows the seconds in every message's time (e.g. 15:34:21)"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Chat", "Appearance"],
    start({ cleanup }) {
        cleanup(onMessageRow("realtime-timestamps", (row, message) => {
            if (typeof row.timestamp !== "string") return;
            const withSeconds = formatDate(timeOf(message), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            row.timestamp = row.timestamp.replace(/\d{1,2}[:.]\d{2}(?:\s?[AaPp]\.?[Mm]\.?)?/, withSeconds);
        }, RowOrder.ADJUST));
    },
});
