/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR, onSettingChange } from "../api";
import { addMessageAction, parseEmoji, react } from "../hooks";

export default definePlugin({
    id: "endcord.custom-reaction-buttons",
    name: "CustomReactionButtons",
    description: tx("Add your own one-tap reactions to the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Emotes", "Chat"],
    settings: {
        emojis: { type: "string", label: tx("Emojis"), description: tx("Separated by spaces; custom emojis are written as <:name:id>"), default: "👍 😂 ❤️" },
    },
    start({ store, cleanup }) {
        let removers: Array<() => void> = [];
        const register = () => {
            removers.forEach(r => r());
            removers = store.emojis.split(/\s+/).filter(Boolean).slice(0, 8).map((text, i) => {
                const emoji = parseEmoji(text)!;
                return addMessageAction({
                    key: `custom-reaction-${i}`,
                    icon: "ReactionIcon",
                    label: () => t("React with {emoji}", { emoji: emoji.id ? `:${emoji.name}:` : emoji.name }),
                    onPress: message => void Promise.resolve(react(message.channel_id, message.id, emoji)).catch(() => showToast(t("Couldn't react with that emoji"), findAssetId("CircleXIcon-primary"))),
                });
            });
        };
        register();
        cleanup(() => removers.forEach(r => r()), onSettingChange(store, register));
    },
});
