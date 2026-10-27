/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR, onSettingChange } from "../api";
import { api } from "../hooks";

const ids = (text: string) => text.split(/[\s,]+/).filter(Boolean);

export default definePlugin({
    id: "endcord.clan-switcher",
    name: "ClanSwitcher",
    description: tx("Automatically switches your Discord server tag"),
    authors: [ENDCORD_AUTHOR],
    icon: "TagIcon",
    tags: ["Customisation", "Fun"],
    settings: {
        clans: { type: "string", label: tx("Servers"), description: tx("IDs of the servers whose tags to rotate, separated by commas"), default: "" },
        intervalSeconds: { type: "number", label: tx("Every (seconds)"), description: tx("How often the tag changes; Discord limits how fast it can"), default: 120, min: 60, max: 86400 },
    },
    start({ store, cleanup, logger }) {
        let index = 0;
        const next = () => {
            const clans = ids(store.clans);
            if (!clans.length) return;
            const guildId = clans[index++ % clans.length];
            api("put", "/users/@me/clan", { identity_guild_id: guildId, identity_enabled: true }).catch(e => logger.warn("Couldn't switch the server tag", e));
        };
        let timer = setInterval(next, store.intervalSeconds * 1000);
        cleanup(
            () => clearInterval(timer),
            // A new interval applies without restarting the plugin
            onSettingChange(store, key => {
                if (key !== "intervalSeconds") return;
                clearInterval(timer);
                timer = setInterval(next, store.intervalSeconds * 1000);
            }),
        );
    },
});
