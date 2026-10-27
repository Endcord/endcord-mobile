/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import moment from "moment";

import { definePlugin } from "../api";
import { onMessageRow, RowOrder } from "../hooks";
import { timeOf } from "../shared/rows";

export default definePlugin({
    id: "endcord.custom-timestamps",
    name: "CustomTimestamps",
    description: tx("Shows message times in a format you choose"),
    icon: "ClockIcon",
    tags: ["Chat", "Customisation"],
    settings: {
        format: {
            type: "string",
            label: tx("Format"),
            description: tx("Moment.js format, like HH:mm:ss, DD/MM/YYYY HH:mm or [Today at] LT"),
            placeholder: "DD/MM/YYYY HH:mm",
            default: "DD/MM/YYYY HH:mm",
        },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("custom-timestamps", (row, message) => {
            if (typeof row.timestamp !== "string" || !store.format.trim()) return;
            try {
                // From the time itself: Discord's message records have had it as a moment, and now have a Date
                row.timestamp = moment(timeOf(message)).format(store.format);
            } catch {
                // An invalid format leaves Discord's time
            }
        }, RowOrder.REPLACE));
    },
});
