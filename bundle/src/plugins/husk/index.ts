/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, parseEmoji, react } from "../hooks";

export default definePlugin({
    id: "endcord.husk",
    name: "Husk",
    description: tx("React with husk from the message menu (change the emoji in settings)"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Emotes", "Fun"],
    settings: {
        emoji: {
            type: "string",
            label: tx("Emoji"),
            description: tx("The emoji to react with, like 💀 or <:husk:1026532993923293184>"),
            default: "<:husk:1026532993923293184>",
        },
    },
    start({ store, cleanup }) {
        cleanup(addMessageAction({
            key: "husk",
            icon: "ReactionIcon",
            label: () => t("Husk"),
            onPress: message => {
                const emoji = parseEmoji(store.emoji) ?? parseEmoji("<:husk:1026532993923293184>")!;
                Promise.resolve(react(message.channel_id, message.id, emoji)).catch(() => showToast(t("Couldn't react with that emoji"), findAssetId("CircleXIcon-primary")));
            },
        }));
    },
});
