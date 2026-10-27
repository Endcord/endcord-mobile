/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { AppState } from "react-native";

import { definePlugin } from "../api";
import { myVoiceChannel } from "../shared/activity";

export default definePlugin({
    id: "endcord.idle-auto-restart",
    name: "IdleAutoRestart",
    description: tx("Reloads Discord when you come back after leaving it in the background for a while, so it starts fresh, but never during a call"),
    icon: "RetryIcon",
    tags: ["Utility"],
    settings: {
        minutes: { type: "number", label: tx("After (minutes)"), default: 60, min: 5, max: 1440 },
    },
    start({ store, cleanup }) {
        let leftAt: number | undefined;
        const subscription = AppState.addEventListener("change", state => {
            if (state === "background") leftAt = Date.now();
            else if (state === "active" && leftAt) {
                const away = Date.now() - leftAt;
                leftAt = undefined;
                if (away >= store.minutes * 60_000 && !myVoiceChannel()) BundleUpdaterManager.reload();
            }
        });
        cleanup(() => subscription.remove());
    },
});
