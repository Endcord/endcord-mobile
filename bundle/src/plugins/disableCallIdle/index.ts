/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";

export default definePlugin({
    id: "endcord.disable-call-idle",
    name: "DisableCallIdle",
    description: tx("Disables automatically getting kicked from a DM voice call after 3 minutes and being moved to an AFK voice channel."),
    authors: [ENDCORD_AUTHOR],
    icon: "PhoneCallIcon",
    tags: ["Voice"],
    start({ cleanup }) {
        const manager = findByProps("idleTimeout", "handleVoiceStateUpdates");
        const timer = manager?.idleTimeout ?? manager?.default?.idleTimeout;
        if (typeof timer?.start !== "function") throw new Error("Discord's call idle timer wasn't found");
        timer.stop?.();
        cleanup(instead("start", timer, () => { }));
    },
});
