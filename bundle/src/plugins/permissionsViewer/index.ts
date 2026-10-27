/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore, guildRoles } from "../common";
import { addMessageAction, displayName, getGuild } from "../hooks";
import { showText } from "../ui/dialogs";

/** The names of the permissions in a bitfield, from Discord's own table */
function permissionNames(bits: unknown): string[] {
    const table = findByProps("Permissions", "ChannelTypes")?.Permissions ?? {};
    const names: string[] = [];
    for (const [name, value] of Object.entries<any>(table)) {
        try {
            if (value && ((bits as any) & value) === value) names.push(name);
        } catch {
            // Mixed number and BigInt bitfields can't be compared
        }
    }
    return names;
}

const title = (name: string) => name.toLowerCase().split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

export default definePlugin({
    id: "endcord.permissions-viewer",
    name: "PermissionsViewer",
    description: tx("See the roles and permissions of a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "permissions-viewer",
            icon: "ShieldIcon",
            label: () => t("View Roles and Permissions"),
            visible: (message, channel) => !!channel?.guild_id && !!message.author?.id,
            onPress: (message, channel) => {
                const guildId = channel.guild_id;
                const guild = getGuild(guildId);
                const member = getStore("GuildMemberStore")?.getMember?.(guildId, message.author.id);
                const roles = guildRoles(guildId);
                const memberRoles = [roles[guildId], ...(member?.roles ?? []).map((id: string) => roles[id])].filter(Boolean).sort((a: any, b: any) => b.position - a.position);
                const owner = guild?.ownerId === message.author.id;
                let bits: any = memberRoles[0]?.permissions;
                for (const role of memberRoles.slice(1)) {
                    try {
                        bits |= role.permissions;
                    } catch { }
                }
                const permissions = permissionNames(bits);
                const isAdmin = owner || permissions.includes("ADMINISTRATOR");
                showText(displayName(message.author), [
                    owner ? `👑 ${t("Server owner")}` : "",
                    `${t("Roles")}: ${memberRoles.map((r: any) => r.name).join(", ") || "—"}`,
                    "",
                    isAdmin ? t("Administrator: every permission") : `${t("Permissions")}:\n${permissions.map(p => `• ${title(p)}`).join("\n") || "—"}`,
                ].filter((line, i) => line || i === 2).join("\n"));
            },
        }));
    },
});
