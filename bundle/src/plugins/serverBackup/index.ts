/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { guildRoles } from "../common";
import { api, botMessage, command, getGuild, share } from "../hooks";

export default definePlugin({
    id: "endcord.server-backup",
    name: "ServerBackup",
    description: tx("Export a server's channels, roles and permissions to a backup file with /serverbackup"),
    authors: [ENDCORD_AUTHOR],
    icon: "ServerIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "serverbackup",
            description: tx("Export this server's channels and roles and share them"),
            run: async (_, ctx) => {
                const guild = getGuild(ctx.channel.guild_id);
                if (!guild) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const [channels, roles] = await Promise.all([
                    api("get", `/guilds/${guild.id}/channels`),
                    api("get", `/guilds/${guild.id}/roles`).catch(() => Object.values(guildRoles(guild.id))),
                ]);
                const backup = {
                    format: "endcord-server-backup",
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    guild: { id: guild.id, name: guild.name, icon: guild.icon, description: guild.description, verificationLevel: guild.verificationLevel },
                    roles,
                    channels,
                };
                // Without indentation, so bigger servers still fit in the share sheet
                await share(JSON.stringify(backup), `${guild.name}.json`);
            },
        }));
    },
});
