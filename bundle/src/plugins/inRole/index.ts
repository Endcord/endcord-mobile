/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { botMessage, command } from "../hooks";

export default definePlugin({
    id: "endcord.in-role",
    name: "InRole",
    description: tx("See who has a role with /inrole"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "inrole",
            description: tx("See who has a role (only members Discord has loaded are listed)"),
            options: [{ name: "role", description: tx("The role"), type: "role", required: true }],
            run: ({ role: roleId }, ctx) => {
                const guildId = ctx.channel.guild_id;
                if (!guildId) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const members: any[] = getStore("GuildMemberStore")?.getMembers?.(guildId) ?? [];
                const ids = members.filter(m => m.roles?.includes(roleId)).map(m => m.userId);
                if (!ids.length) {
                    botMessage(ctx.channel.id, t("Nobody Discord has loaded has <@&{role}>. Scroll the member list to load more members.", { role: roleId }));
                    return;
                }
                const shown = ids.slice(0, 60).map(id => `<@${id}>`).join(", ");
                const more = ids.length > 60 ? `\n${t("…and {count} more", { count: ids.length - 60 })}` : "";
                botMessage(ctx.channel.id, `${t("{count} members have <@&{role}>:", { count: ids.length, role: roleId })}\n${shown}${more}`);
            },
        }));
    },
});
