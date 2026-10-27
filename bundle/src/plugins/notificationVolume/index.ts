/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { patchSoundManager } from "../shared/activity";

export default definePlugin({
    id: "endcord.notification-volume",
    name: "NotificationVolume",
    description: tx("Save your ears and set a separate volume for notifications and in-app sounds"),
    authors: [ENDCORD_AUTHOR],
    icon: "BellIcon",
    tags: ["Notifications"],
    settings: {
        volume: { type: "number", label: tx("Volume (%)"), default: 50, min: 0, max: 100 },
    },
    start({ store, cleanup }) {
        const factor = () => Math.min(Math.max(store.volume / 100, 0), 1);
        let setVolume: ((id: number, volume: number) => unknown) | undefined;
        cleanup(patchSoundManager("setVolume", manager => {
            const original = manager.setVolume?.bind(manager);
            setVolume = original;
            return instead("setVolume", manager, ([id, volume], orig) => orig(id, Number(volume) * factor()));
        }));
        cleanup(patchSoundManager("prepare", manager => instead("prepare", manager, (args, orig) => {
            const done = args[3];
            // Discord doesn't always set a volume, so every sound starts at the chosen one
            return orig(args[0], args[1], args[2], (error: unknown, sound: unknown) => {
                if (!error) setVolume?.(args[2], factor());
                if (typeof done === "function") done(error, sound);
            });
        })));
    },
});
