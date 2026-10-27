/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { loadedMessages, onSend, parseEmoji, react } from "../hooks";

export default definePlugin({
    id: "endcord.better-plus-reacts",
    name: "BetterPlusReacts",
    description: tx("React to an earlier message by typing +:emoji:, with one + per message back"),
    icon: "ReactionIcon",
    tags: ["Chat", "Emotes"],
    start({ cleanup }) {
        cleanup(onSend("better-plus-reacts", (content, { channelId, editing }) => {
            const match = !editing && content.trim().match(/^(\++)(\S+)$/u);
            if (!match) return;
            const emoji = parseEmoji(match[2]);
            if (!emoji || /^[\w:]+$/.test(emoji.name) && !emoji.id) return;
            const messages = loadedMessages(channelId);
            const target = messages[messages.length - match[1].length];
            if (!target) return;
            react(channelId, target.id, emoji);
            return null;
        }, -10));
    },
});
