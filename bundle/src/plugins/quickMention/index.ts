/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction, copy, insertText } from "../hooks";

export default definePlugin({
    id: "endcord.quick-mention",
    name: "QuickMention",
    description: tx("Mention a message's author from the message menu"),
    icon: "AtIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "quick-mention",
            icon: "AtIcon",
            label: () => t("Mention"),
            visible: message => !!message.author?.id,
            onPress: message => {
                const mention = `<@${message.author.id}> `;
                if (!insertText(message.channel_id, mention)) copy(mention.trim(), t("Mention copied"));
            },
        }));
    },
});
