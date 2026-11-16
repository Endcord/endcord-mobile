/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's UnreadCountBadge puts how many unread messages a channel has on its row of the channel list. Discord
 * 353's channel list draws its rows from code a plugin can't reach (checked on the device: patching the row components
 * changes nothing), so on the phone the counts are listed with /unread instead.
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command, getChannel } from "../hooks";
import { channelLabel, guildChannels } from "../shared/navigation";
import { escapeMarkdown } from "./markdown";

/** Muted as PC counts it: the channel itself, or the thread you joined */
function isMuted(guildId: string | undefined, channelId: string): boolean {
    try {
        return !!(getStore("UserGuildSettingsStore")?.isChannelMuted?.(guildId ?? null, channelId) || getStore("JoinedThreadsStore")?.isMuted?.(channelId));
    } catch {
        return false;
    }
}

export default definePlugin({
    id: "endcord.unread-count-badge",
    name: "UnreadCountBadge",
    description: tx("See how many unread messages each channel of a server has with /unread"),
    icon: "ChatIcon",
    tags: ["Servers", "Utility"],
    settings: {
        showOnMutedChannels: { type: "boolean", label: tx("Show unread count on muted channels"), default: false },
    },
    start({ store, cleanup }) {
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
                    // Muted channels as on PC: left out unless asked for, but never when they mention you
                    if (!mentions && !store.showOnMutedChannels && isMuted(guildId, c.id)) return [];
                    const parts = [count ? t("{count} unread", { count }) : t("unread"), mentions ? t("{count} mentions", { count: mentions }) : ""].filter(Boolean);
                    // A DM's name is someone else's text (a group DM's, or the people in it): shown as they wrote it
                    return [`${guildId ? `<#${c.id}>` : escapeMarkdown(channelLabel(c.id))} · ${parts.join(" · ")}`];
                });
                botMessage(ctx.channel.id, lines.length ? lines.slice(0, 40).join("\n") : t("Everything here is read."));
            },
        }));
    },
});
