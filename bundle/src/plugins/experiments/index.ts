/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { holdDiscordDeveloper } from "@lib/api/settings";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";

export default definePlugin({
    id: "endcord.experiments",
    name: "Experiments",
    description: tx("Enable Access to Experiments & other dev-only features in Discord!"),
    authors: [ENDCORD_AUTHOR],
    icon: "BeakerIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        // Held on while the plugin runs rather than written to the user's setting, which a restart in between would
        // otherwise leave on for good
        const release = holdDiscordDeveloper();
        getStore("DeveloperExperimentStore")?.emitChange?.();
        cleanup(() => {
            release();
            getStore("DeveloperExperimentStore")?.emitChange?.();
        });
    },
});
