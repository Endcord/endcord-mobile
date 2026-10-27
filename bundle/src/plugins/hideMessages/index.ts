/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction, hideLocally, onIncomingMessage } from "../hooks";

export default definePlugin({
    id: "endcord.hide-messages",
    name: "HideMessages",
    description: tx("Hide messages from the message menu until you restart Discord"),
    icon: "EyeSlashIcon",
    tags: ["Chat", "Privacy"],
    start({ cleanup }) {
        const hidden = new Set<string>();
        cleanup(
            () => hidden.clear(),
            onIncomingMessage("hide-messages", message => hidden.has(message.id) ? null : undefined),
            addMessageAction({
                key: "hide-messages",
                icon: "EyeSlashIcon",
                label: () => t("Hide Message"),
                onPress: (message, channel) => {
                    hidden.add(message.id);
                    hideLocally(channel?.id ?? message.channel_id, message.id);
                },
            }),
        );
    },
});
