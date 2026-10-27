/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getChannel, getGuild, onMessageRow } from "../hooks";
import { hasPermission, memberPermissions } from "../shared/servers";

export default definePlugin({
    id: "endcord.more-user-tags",
    name: "MoreUserTags",
    description: tx("Adds tags for webhooks and moderative roles (owner, admin, etc.)"),
    icon: "ShieldIcon",
    tags: ["Appearance", "Chat"],
    settings: {
        owner: { type: "boolean", label: tx("Owner"), description: tx("Tag the server owner"), default: true },
        admin: { type: "boolean", label: tx("Admin"), description: tx("Tag members with the Administrator permission"), default: true },
        moderator: { type: "boolean", label: tx("Moderator"), description: tx("Tag members who can manage messages, kick, ban or time out"), default: true },
        webhook: { type: "boolean", label: tx("Webhook"), description: tx("Tag messages sent by webhooks"), default: true },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("more-user-tags", (row, message) => {
            if (typeof row.timestamp !== "string") return;
            const guildId = getChannel(message.channel_id)?.guild_id;
            let tag: string | undefined;
            if (message.webhookId && store.webhook) tag = t("WEBHOOK");
            else if (guildId && message.author?.id) {
                const bits = memberPermissions(guildId, message.author.id);
                if (store.owner && getGuild(guildId)?.ownerId === message.author.id) tag = t("OWNER");
                else if (store.admin && hasPermission(bits, "ADMINISTRATOR")) tag = t("ADMIN");
                else if (store.moderator && ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS", "MODERATE_MEMBERS"].some(p => hasPermission(bits, p))) tag = t("MOD");
            }
            if (tag && !row.timestamp.startsWith(`[${tag}]`)) row.timestamp = `[${tag}] ${row.timestamp}`;
        }));
    },
});
