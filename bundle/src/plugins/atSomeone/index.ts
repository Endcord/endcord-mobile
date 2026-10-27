/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId, getStore } from "../common";
import { getChannel, onSend } from "../hooks";

export default definePlugin({
    id: "endcord.at-someone",
    name: "AtSomeone",
    description: tx("Mention a random member of the channel"),
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(onSend("at-someone", (content, { channelId, editing }) => {
            if (editing || !/@someone\b/i.test(content)) return;
            const channel = getChannel(channelId);
            const me = currentUserId();
            let ids: string[];
            if (channel?.guild_id) {
                ids = (getStore("GuildMemberStore")?.getMemberIds?.(channel.guild_id) ?? []).filter((id: string) => id !== me);
            } else {
                ids = (channel?.recipients ?? []).filter((id: string) => id !== me);
            }
            if (!ids.length) return;
            return content.replace(/@someone\b/gi, () => `<@${ids[Math.floor(Math.random() * ids.length)]}>`);
        }, 5));
    },
});
