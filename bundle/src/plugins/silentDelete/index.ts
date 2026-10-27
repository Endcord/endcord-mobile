/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { addMessageAction, deleteMessage, edit } from "../hooks";
import { isMine } from "../shared/actions";

export default definePlugin({
    id: "endcord.silent-delete",
    name: "SilentDelete",
    description: tx("\"Silently\" deletes a message. Bypass message loggers by replacing the message with a placeholder."),
    icon: "TrashIcon",
    tags: ["Privacy", "Chat"],
    settings: {
        replacementText: { type: "string", label: tx("Replacement text"), description: tx("Text to replace the message with before deletion."), default: "** **" },
        deleteDelay: { type: "number", label: tx("Delay (milliseconds)"), description: tx("Delay in milliseconds before deleting the replacement message (recommended at least 200)."), default: 200, min: 0, max: 10000 },
    },
    start({ store, cleanup }) {
        cleanup(addMessageAction({
            key: "silent-delete",
            icon: "TrashIcon",
            danger: true,
            label: () => t("Silent Delete"),
            visible: isMine,
            onPress: async message => {
                try {
                    await edit(message.channel_id, message.id, store.replacementText || "** **");
                    setTimeout(() => deleteMessage(message.channel_id, message.id), store.deleteDelay);
                } catch {
                    showToast(t("Couldn't delete the message"), findAssetId("CircleXIcon-primary"));
                }
            },
        }));
    },
});
