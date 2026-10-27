/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { botMessage, command, getGuild } from "../hooks";

export default definePlugin({
    id: "endcord.member-count",
    name: "MemberCount",
    description: tx("See how many members a server has, how many are online and how many are in voice, with /membercount"),
    authors: [ENDCORD_AUTHOR],
    icon: "GroupIcon",
    tags: ["Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "membercount",
            description: tx("Show how many members this server has (only you see it)"),
            run: (_, ctx) => {
                const guildId = ctx.channel.guild_id;
                if (!guildId) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const counts = getStore("GuildMemberCountStore");
                const total = counts?.getMemberCount?.(guildId);
                const online = counts?.getOnlineCount?.(guildId);
                const voice = Object.values<any>(getStore("VoiceStateStore")?.getVoiceStates?.(guildId) ?? {}).length;
                botMessage(ctx.channel.id, [
                    `👥 **${getGuild(guildId)?.name}**`,
                    total != null && `> ${t("Members")}: **${total}**`,
                    online != null && `> ${t("Online")}: **${online}**`,
                    `> ${t("In voice")}: **${voice}**`,
                ].filter(Boolean).join("\n"));
            },
        }));
    },
});
