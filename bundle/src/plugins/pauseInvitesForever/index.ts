/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { api, botMessage, command, describeError, getGuild } from "../hooks";

export default definePlugin({
    id: "endcord.pause-invites-forever",
    name: "PauseInvitesForever",
    description: tx("Pause a server's invites with no time limit, which Discord no longer offers, with /pauseinvites"),
    icon: "LinkIcon",
    tags: ["Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "pauseinvites",
            description: tx("Pause or resume this server's invites with no time limit"),
            run: async (_, ctx) => {
                const guild = getGuild(ctx.channel.guild_id);
                if (!guild) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const features: string[] = [...(guild.features ?? [])];
                const paused = features.includes("INVITES_DISABLED");
                try {
                    await api("patch", `/guilds/${guild.id}`, {
                        features: paused ? features.filter(f => f !== "INVITES_DISABLED") : [...features, "INVITES_DISABLED"],
                    });
                    botMessage(ctx.channel.id, paused ? t("Invites to {server} are open again.", { server: guild.name }) : t("Invites to {server} are paused until you resume them.", { server: guild.name }));
                } catch (e: any) {
                    botMessage(ctx.channel.id, `❌ ${t("Request failed: {error}", { error: describeError(e) })}`);
                }
            },
        }));
    },
});
