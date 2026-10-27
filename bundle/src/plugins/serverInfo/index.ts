/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore, guildRoles } from "../common";
import { botMessage, command, getGuild } from "../hooks";
import { CDN, unix } from "../shared/lookup";

const snowflakeMs = (id: string) => Math.floor(Number(id) / 4194304) + 1420070400000;

const VERIFICATION = [tx("None"), tx("Low"), tx("Medium"), tx("High"), tx("Highest")];

export default definePlugin({
    id: "endcord.server-info",
    name: "ServerInfo",
    description: tx("Allows you to view info about a server"),
    authors: [ENDCORD_AUTHOR],
    icon: "ServerIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "serverinfo",
            description: tx("Show information about this server (only you see it)"),
            run: (_, ctx) => {
                const guild = getGuild(ctx.channel.guild_id);
                if (!guild) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const created = snowflakeMs(guild.id);
                const members = getStore("GuildMemberCountStore")?.getMemberCount?.(guild.id);
                const channels = Object.values(getStore("ChannelStore")?.getMutableGuildChannelsForGuild?.(guild.id) ?? {}).length;
                const roles = Object.keys(guildRoles(guild.id)).length;
                const icon = guild.icon ? `${CDN}/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith("a_") ? "gif" : "png"}?size=1024` : null;
                const lines = [
                    `**${guild.name}**`,
                    `> **${t("ID")}**: \`${guild.id}\``,
                    `> **${t("Owner")}**: <@${guild.ownerId}>`,
                    `> **${t("Created")}**: <t:${unix(created)}:D> (<t:${unix(created)}:R>)`,
                    members != null && `> **${t("Members")}**: ${members}`,
                    channels && `> **${t("Channels")}**: ${channels}`,
                    roles && `> **${t("Roles")}**: ${roles}`,
                    `> **${t("Boosts")}**: ${guild.premiumSubscriberCount ?? 0} (${t("Level {level}", { level: guild.premiumTier ?? 0 })})`,
                    `> **${t("Verification level")}**: ${t(VERIFICATION[guild.verificationLevel] ?? VERIFICATION[0])}`,
                    guild.vanityURLCode && `> **${t("Vanity URL")}**: discord.gg/${guild.vanityURLCode}`,
                    icon && `> **${t("Icon")}**: <${icon}>`,
                ].filter(Boolean);
                botMessage(ctx.channel.id, lines.join("\n"));
            },
        }));
    },
});
