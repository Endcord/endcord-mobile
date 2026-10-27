/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import { botMessage, command, getGuild } from "../hooks";

export default definePlugin({
    id: "endcord.mutual-server-members",
    name: "MutualServerMembers",
    description: tx("Compare two servers you're in and see which members are in both, with /mutualmembers"),
    authors: [ENDCORD_AUTHOR],
    icon: "GroupIcon",
    tags: ["Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "mutualmembers",
            description: tx("Members that this server and another one share (from the members Discord has loaded)"),
            options: [{ name: "server", description: tx("The other server's ID"), required: true }],
            run: ({ server }, ctx) => {
                const here = ctx.channel.guild_id;
                const other = getGuild(String(server).trim());
                if (!here || !other) {
                    botMessage(ctx.channel.id, t("Use this in a server, with the ID of another server you're in."));
                    return;
                }
                const members = getStore("GuildMemberStore");
                const a = new Set<string>(members?.getMemberIds?.(here) ?? []);
                const shared = (members?.getMemberIds?.(other.id) ?? []).filter((id: string) => a.has(id) && id !== currentUserId());
                botMessage(ctx.channel.id, shared.length
                    ? `${t("{count} members are also in {server}:", { count: shared.length, server: other.name })}\n${shared.slice(0, 60).map((id: string) => `<@${id}>`).join(", ")}${shared.length > 60 ? `\n${t("…and {count} more", { count: shared.length - 60 })}` : ""}`
                    : t("No shared members among those Discord has loaded."));
            },
        }));
    },
});
