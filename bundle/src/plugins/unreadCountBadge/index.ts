/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { botMessage, command, getChannel } from "../hooks";
import { channelLabel, guildChannels } from "../shared/navigation";

export default definePlugin({
    id: "endcord.unread-count-badge",
    name: "UnreadCountBadge",
    description: tx("See how many unread messages each channel of a server has with /unread"),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Utility", "Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "unread",
            description: tx("List this server's channels with unread messages"),
            run: (_, ctx) => {
                const reads = getStore("ReadStateStore");
                const guildId = ctx.channel.guild_id;
                const channels = guildId ? guildChannels(guildId, "SELECTABLE") : (getStore("PrivateChannelSortStore")?.getPrivateChannelIds?.() ?? []).map((id: string) => getChannel(id)).filter(Boolean);
                const lines = channels.flatMap((c: any) => {
                    const count: number = reads?.getUnreadCount?.(c.id) ?? 0;
                    const mentions: number = reads?.getMentionCount?.(c.id) ?? 0;
                    if (!count && !mentions && !reads?.hasUnread?.(c.id)) return [];
                    const parts = [count ? t("{count} unread", { count }) : t("unread"), mentions ? t("{count} mentions", { count: mentions }) : ""].filter(Boolean);
                    return [`${guildId ? `<#${c.id}>` : channelLabel(c.id)} · ${parts.join(" · ")}`];
                });
                botMessage(ctx.channel.id, lines.length ? lines.slice(0, 40).join("\n") : t("Everything here is read."));
            },
        }));
    },
});
