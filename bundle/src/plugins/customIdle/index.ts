/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onAction } from "../common";

export default definePlugin({
    id: "endcord.custom-idle",
    name: "CustomIdle",
    description: tx("Stops Discord from marking you idle while the app is in the background"),
    authors: [ENDCORD_AUTHOR],
    icon: "BellZIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        // Discord marks you idle with this action when the app has been in the background
        cleanup(onAction<{ idle: boolean; }>("IDLE", ({ idle }) => idle ? { idle: false } : undefined));
    },
});
