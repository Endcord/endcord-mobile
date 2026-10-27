/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { onMessageRow } from "../hooks";
import { prependToTimestamp } from "../shared/rows";

export default definePlugin({
    id: "endcord.show-timeout-duration",
    name: "ShowTimeoutDuration",
    description: tx("Shows how much longer a user's timeout will last next to their messages"),
    icon: "TimerIcon",
    tags: ["Servers", "Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("show-timeout-duration", (row, message) => {
            const guildId = getStore("ChannelStore")?.getChannel?.(message.channel_id)?.guild_id;
            if (!guildId || !message.author?.id) return;
            const until = Date.parse(getStore("GuildMemberStore")?.getMember?.(guildId, message.author.id)?.communicationDisabledUntil ?? "");
            const left = until - Date.now();
            if (!(left > 0)) return;
            const minutes = Math.ceil(left / 60_000);
            const text = minutes >= 1440 ? t("{count}d", { count: Math.round(minutes / 1440) }) : minutes >= 60 ? t("{count}h", { count: Math.round(minutes / 60) }) : t("{count}m", { count: minutes });
            prependToTimestamp(row, `⏳ ${t("Timed out, {time} left", { time: text })} · `);
        }));
    },
});
