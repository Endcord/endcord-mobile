/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { subscribe } from "../common";
import { currentChannelId, displayName, getUser, playSound } from "../hooks";
import { ids } from "../shared/channels";

export default definePlugin({
    id: "endcord.anti-snitch",
    name: "AntiSnitch",
    description: tx("Alerts you with a sound and toast whenever selected users start typing in your current channel."),
    authors: [ENDCORD_AUTHOR],
    icon: "KeyboardIcon",
    tags: ["Notifications", "Fun"],
    settings: {
        users: { type: "string", label: tx("Users"), description: tx("User IDs separated by commas"), placeholder: tx("e.g. 123456789012345678, 234567890123456789"), default: "" },
        sound: { type: "string", label: tx("Sound"), description: tx("A link to a sound to play; leave empty for none"), default: "" },
    },
    start({ store, cleanup }) {
        const last = new Map<string, number>();
        cleanup(subscribe("TYPING_START", ({ channelId, userId }) => {
            if (channelId !== currentChannelId() || !ids(store.users).has(userId)) return;
            // Discord repeats this every few seconds while they type
            if (Date.now() - (last.get(userId) ?? 0) < 15_000) return;
            last.set(userId, Date.now());
            showToast(t("{user} is typing", { user: displayName(getUser(userId) ?? { id: userId }) }), findAssetId("KeyboardIcon"));
            if (store.sound.trim()) playSound(store.sound.trim());
        }));
    },
});
