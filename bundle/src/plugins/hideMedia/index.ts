/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { dispatchSoon } from "../common";
import { addMessageAction, api, onIncomingMessage, toastError } from "../hooks";
import { mediaOf } from "../shared/actions";

export default definePlugin({
    id: "endcord.hide-media",
    name: "HideMedia",
    description: tx("Hide the attachments and embeds of a message from the message menu"),
    icon: "EyeSlashIcon",
    tags: ["Media", "Chat"],
    start({ cleanup }) {
        const hidden = new Set<string>();
        const channelOf = new Map<string, string>();
        const restore = async (channelId: string, id: string) => {
            // The original attachments and embeds come from the server, exactly as they were
            const [message] = await api("get", `/channels/${channelId}/messages?limit=1&around=${id}`);
            if (message?.id === id) dispatchSoon({ type: "MESSAGE_UPDATE", message });
        };
        cleanup(
            () => {
                for (const id of hidden) {
                    const channelId = channelOf.get(id);
                    if (channelId) restore(channelId, id).catch(() => { });
                }
                hidden.clear();
            },
            onIncomingMessage("hide-media", message => hidden.has(message.id) ? { ...message, attachments: [], embeds: [] } : undefined),
            addMessageAction({
                key: "hide-media",
                icon: "EyeSlashIcon",
                label: message => hidden.has(message.id) ? t("Show Media") : t("Hide Media"),
                visible: message => hidden.has(message.id) || mediaOf(message).length > 0,
                onPress: message => {
                    channelOf.set(message.id, message.channel_id);
                    if (hidden.delete(message.id)) {
                        restore(message.channel_id, message.id).catch(toastError);
                    } else {
                        hidden.add(message.id);
                        dispatchSoon({ type: "MESSAGE_UPDATE", message: { id: message.id, channel_id: message.channel_id, attachments: [], embeds: [] } });
                    }
                },
            }),
        );
    },
});
