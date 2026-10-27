/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, displayName, messageLink, share } from "../hooks";
import { mediaOf } from "../shared/actions";

export default definePlugin({
    id: "endcord.export-messages",
    name: "ExportMessages",
    description: tx("Share any message as text from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShareIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "export-message",
            icon: "ShareIcon",
            label: () => t("Export Message"),
            onPress: message => {
                const time = typeof message.timestamp?.toDate === "function" ? message.timestamp.toDate() : new Date(message.timestamp);
                const lines = [
                    `${displayName(message.author)} (@${message.author?.username}) — ${time.toLocaleString()}`,
                    message.content,
                    ...mediaOf(message).map(m => m.url),
                    messageLink(message.channel_id, message.id),
                ].filter(Boolean);
                share(lines.join("\n"));
            },
        }));
    },
});
