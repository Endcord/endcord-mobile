/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's MoreJumboEmoji: a message made only of emojis shows them big (jumbo) up to the number you pick, not
 * just up to Discord's limit. PC changes the number in Discord's code; on the phone that number is built into
 * Discord's compiled code (changing its exported constant does nothing, checked on Discord 353), so the chat row is
 * marked jumbo the way Discord marks it: every part of an emoji-only message gets jumboable, which the native chat
 * draws big.
 */

import { tx } from "@core/i18n";

import { definePlugin, onSettingChange } from "../api";
import { onMessageRow, redrawChannel, RowOrder } from "../hooks";
import { jumboContent } from "./jumbo";

export default definePlugin({
    id: "endcord.more-jumbo-emoji",
    name: "MoreJumboEmoji",
    description: tx("Unlock the maximum amount of jumbo emoji"),
    icon: "ReactionIcon",
    tags: ["Emotes", "Customisation"],
    settings: {
        threshold: { type: "number", label: tx("Number of emojis that are allowed to be jumbo"), default: 50, min: 0, max: 200 },
        unlimited: { type: "boolean", label: tx("Unlimited jumbo emojis"), default: false },
    },
    start({ store, cleanup }) {
        const limit = () => store.unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.min(200, Math.round(Number(store.threshold) || 0)));
        cleanup(
            onMessageRow("more-jumbo-emoji", row => {
                const content = jumboContent(row.content, limit());
                if (content) row.content = content;
            }, RowOrder.ADJUST),
            onSettingChange(store, key => {
                if (key === "threshold" || key === "unlimited") redrawChannel();
            }),
        );
    },
});
