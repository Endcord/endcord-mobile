/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { botMessage, command, getGuild } from "../hooks";
import { holdServerPatch, listOf, pins, refreshServers, serverList, toggleIn } from "../shared/navigation";

export default definePlugin({
    id: "endcord.hide-servers",
    name: "HideServers",
    description: tx("Hide servers from your server list with /hideserver, and bring them back from the plugin's settings"),
    icon: "EyeSlashIcon",
    tags: ["Servers"],
    SettingsComponent: serverList("hidden", tx("Hidden servers"), tx("Use /hideserver in a server to hide it"), tx("Show again")),
    async start({ cleanup }) {
        await awaitStorage(pins);
        cleanup(
            holdServerPatch(),
            command({
                name: "hideserver",
                description: tx("Hide this server from your server list"),
                run: (_, ctx) => {
                    const guildId = ctx.channel.guild_id;
                    if (!guildId) return botMessage(ctx.channel.id, t("Use it in a server."));
                    if (!listOf("hidden").includes(guildId)) toggleIn("hidden", guildId);
                    refreshServers?.();
                    showToast(t("{server} is hidden from your server list", { server: getGuild(guildId)?.name ?? guildId }), findAssetId("EyeSlashIcon"));
                },
            }),
        );
    },
});
