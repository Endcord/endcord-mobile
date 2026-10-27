/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { appendToTimestamp, onMessageRow } from "../hooks";

export default definePlugin({
    id: "endcord.pin-icon",
    name: "PinIcon",
    description: tx("Adds a pin icon to pinned messages"),
    authors: [ENDCORD_AUTHOR],
    icon: "PinIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("pin-icon", (row, message) => {
            if (message.pinned) appendToTimestamp(row, " · 📌");
        }));
    },
});
