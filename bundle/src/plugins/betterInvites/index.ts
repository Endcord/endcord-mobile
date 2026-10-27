/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { api, botMessage, command } from "../hooks";

export default definePlugin({
    id: "endcord.better-invites",
    name: "BetterInvites",
    description: tx("See where an invite leads, who made it and when it expires, before joining, with /inviteinfo"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "inviteinfo",
            description: tx("Look at an invite without joining"),
            options: [{ name: "invite", description: tx("The invite link or code"), required: true }],
            run: async ({ invite }, ctx) => {
                const code = String(invite).trim().replace(/^(https?:\/\/)?(www\.)?(discord\.gg|discord(app)?\.com\/invite)\//, "").split(/[/?#]/)[0];
                const data = await api("get", `/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`);
                const lines = [
                    `**${data?.guild?.name ?? data?.channel?.name ?? code}**`,
                    data?.guild?.description,
                    data?.channel?.name ? `${t("Channel")}: #${data.channel.name}` : undefined,
                    data?.inviter ? `${t("Made by")}: ${data.inviter.global_name ?? data.inviter.username} (${data.inviter.username})` : undefined,
                    data?.approximate_member_count != null ? t("{members} members, {online} online", { members: data.approximate_member_count, online: data.approximate_presence_count ?? "?" }) : undefined,
                    `${t("Expires")}: ${data?.expires_at ? `<t:${Math.floor(Date.parse(data.expires_at) / 1000)}:R>` : t("never")}`,
                ].filter(Boolean);
                botMessage(ctx.channel.id, lines.join("\n"));
            },
        }));
    },
});
