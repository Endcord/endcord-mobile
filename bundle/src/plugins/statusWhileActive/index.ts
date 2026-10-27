/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { subscribe } from "../common";
import { myVoiceChannel, STATUS_OPTIONS, statusHold } from "../shared/activity";

export default definePlugin({
    id: "endcord.status-while-active",
    name: "StatusWhileActive",
    description: tx("Automatically updates your online status when in a voice channel."),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Notifications"],
    settings: {
        status: { type: "select", label: tx("Status while in a voice channel"), description: tx("Your status goes back to what it was when you leave"), default: "dnd", options: STATUS_OPTIONS },
    },
    start({ store, cleanup }) {
        const hold = statusHold();
        const check = () => {
            if (myVoiceChannel()) hold.set(store.status);
            else hold.release();
        };
        cleanup(() => hold.release(), subscribe("VOICE_CHANNEL_SELECT", () => setTimeout(check, 0)));
        check();
    },
});
