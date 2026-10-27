/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import formatDate from "@lib/utils/formatDate";

import { definePlugin } from "../api";
import { appendToTimestamp, onMessageRow } from "../hooks";
import { cached, lines, timeOf } from "../shared/rows";

export default definePlugin({
    id: "endcord.timezones",
    name: "Timezones",
    description: tx("Shows the local time of the users you choose next to their messages"),
    icon: "GlobeEarthIcon",
    tags: ["Utility"],
    settings: {
        timezones: {
            type: "string",
            label: tx("Users' time zones"),
            description: tx("One per line: user ID = time zone, like 123456789012345678 = Europe/Istanbul"),
            placeholder: "123456789012345678 = Europe/Istanbul",
            multiline: true,
            default: "",
        },
        twentyFourHourFormat: { type: "boolean", label: tx("24-hour clock"), description: tx("Show time in 24h format"), default: true },
        showTimezoneInfo: { type: "boolean", label: tx("Show the time zone"), description: tx("Show timezone info next to time"), default: false },
    },
    start({ store, cleanup }) {
        const zones = cached(lines);
        cleanup(onMessageRow("timezones", (row, message) => {
            const zone = zones(store.timezones).get(message.author?.id);
            if (!zone) return;
            try {
                const local = formatDate(timeOf(message), { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: !store.twentyFourHourFormat });
                appendToTimestamp(row, ` · 🕒 ${local}${store.showTimezoneInfo ? ` (${zone})` : ""}`);
            } catch {
                // Unknown time zone
            }
        }));
    },
});
