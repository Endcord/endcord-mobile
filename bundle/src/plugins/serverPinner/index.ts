/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { botMessage, command } from "../hooks";
import { holdServerPatch, pins, refreshServers, serverList, toggleIn } from "../shared/navigation";

export default definePlugin({
    id: "endcord.server-pinner",
    name: "ServerPinner",
    description: tx("Pin servers to the top of your server list with /pinserver, without changing your folders"),
    authors: [ENDCORD_AUTHOR],
    icon: "PinIcon",
    tags: ["Servers"],
    SettingsComponent: serverList("servers", tx("Pinned servers"), tx("Use /pinserver in a server to pin it"), tx("Unpin")),
    async start({ cleanup }) {
        await awaitStorage(pins);
        cleanup(
            holdServerPatch(),
            command({
                name: "pinserver",
                description: tx("Pin or unpin this server at the top of your server list"),
                run: (_, ctx) => {
                    const guildId = ctx.channel.guild_id;
                    if (!guildId) return botMessage(ctx.channel.id, t("Use it in a server."));
                    const pinned = toggleIn("servers", guildId);
                    refreshServers?.();
                    showToast(pinned ? t("Pinned") : t("Unpinned"), findAssetId("PinIcon"));
                },
            }),
        );
    },
});
