/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import { onMessageRow } from "../hooks";
import { prependToTimestamp } from "../shared/rows";

export default definePlugin({
    id: "endcord.user-messages-pronouns",
    name: "UserMessagesPronouns",
    description: tx("Shows people's pronouns from their Discord profile next to their messages"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        showSelf: { type: "boolean", label: tx("On my messages too"), description: tx("Enable or disable showing pronouns for yourself"), default: true },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("pronouns", (row, message) => {
            const userId = message.author?.id;
            if (!userId || !store.showSelf && userId === currentUserId()) return;
            const profiles = getStore("UserProfileStore");
            const guildId = getStore("ChannelStore")?.getChannel?.(message.channel_id)?.guild_id;
            const pronouns = (guildId && profiles?.getGuildMemberProfile?.(userId, guildId)?.pronouns) || profiles?.getUserProfile?.(userId)?.pronouns;
            if (pronouns) prependToTimestamp(row, `${pronouns} · `);
        }));
    },
});
