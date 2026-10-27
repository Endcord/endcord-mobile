/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import { appendToTimestamp, onMessageRow } from "../hooks";

export default definePlugin({
    id: "endcord.mention-colors",
    name: "MentionColors",
    description: tx("Marks messages that mention you directly differently from @everyone and @here pings"),
    authors: [ENDCORD_AUTHOR],
    icon: "AtIcon",
    tags: ["Chat", "Notifications"],
    start({ cleanup }) {
        cleanup(onMessageRow("mention-colors", (row, message) => {
            const me = currentUserId();
            if (!me || message.author?.id === me) return;
            const users: any[] = message.mentions ?? [];
            if (users.some(u => (typeof u === "string" ? u : u?.id) === me)) return appendToTimestamp(row, ` · 🔔 ${t("you")}`);
            const roles: string[] = message.mentionRoles ?? message.mention_roles ?? [];
            const guildId = getStore("ChannelStore")?.getChannel?.(message.channel_id)?.guild_id;
            const mine: string[] = roles.length && guildId ? getStore("GuildMemberStore")?.getMember?.(guildId, me)?.roles ?? [] : [];
            if (roles.some(r => mine.includes(r))) return appendToTimestamp(row, ` · 🏷 ${t("your role")}`);
            if (message.mentionEveryone ?? message.mention_everyone) appendToTimestamp(row, " · 📣 @everyone");
        }));
    },
});
