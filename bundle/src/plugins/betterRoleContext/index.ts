/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command, getGuild } from "../hooks";
import { hasPermission, unix } from "../shared/servers";

const snowflakeMs = (id: string) => Math.floor(Number(id) / 4194304) + 1420070400000;

export default definePlugin({
    id: "endcord.better-role-context",
    name: "BetterRoleContext",
    description: tx("See a role's color, icon, members and permissions with /roleinfo"),
    icon: "ShieldIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "roleinfo",
            description: tx("Show information about a role (only you see it)"),
            options: [{ name: "role", description: tx("The role"), type: "role", required: true }],
            run: ({ role: roleId }, ctx) => {
                const guildId = ctx.channel.guild_id;
                const role = guildId && (getStore("GuildRoleStore")?.getRole?.(guildId, roleId) ?? getGuild(guildId)?.roles?.[roleId]);
                if (!role) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const members = (getStore("GuildMemberStore")?.getMembers?.(guildId) ?? []).filter((m: any) => m.roles?.includes(roleId)).length;
                const color = role.colorString ?? (role.color ? `#${role.color.toString(16).padStart(6, "0")}` : t("None"));
                const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions ?? {};
                const granted = Object.keys(permissions).filter(name => hasPermission(role.permissions, name));
                botMessage(ctx.channel.id, [
                    `**${role.name}** \`${role.id}\``,
                    `> ${t("Color")}: ${color}`,
                    `> ${t("Members Discord has loaded")}: ${members}`,
                    `> ${t("Created")}: <t:${unix(snowflakeMs(role.id))}:D>`,
                    role.icon && `> ${t("Icon")}: <https://cdn.discordapp.com/role-icons/${role.id}/${role.icon}.png>`,
                    role.hoist && `> ${t("Shown separately in the member list")}`,
                    role.mentionable && `> ${t("Anyone can mention it")}`,
                    `> ${t("Permissions")}: ${granted.includes("ADMINISTRATOR") ? t("Administrator: every permission") : granted.map(p => p.toLowerCase().replace(/_/g, " ")).join(", ") || "—"}`,
                ].filter(Boolean).join("\n"));
            },
        }));
    },
});
