/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore } from "../common";
import { currentChannelId, generatedIcon, localSnowflake, receiveLocalMessage } from "../hooks";
import { rawUser } from "../shared/tools";

export default definePlugin({
    id: "endcord.preview-message",
    name: "PreviewMessage",
    description: tx("Lets you preview your message before sending it."),
    icon: "EyeIcon",
    tags: ["Chat"],
    settings: {
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "right",
            options: [
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        cleanup(addChatButton({
            key: "preview-message",
            side: () => store.button as "left" | "right",
            render: () => {
                const Button = getChatInputActionButton();
                const Icon = generatedIcon("EyeIcon");
                if (!Button || !Icon) return null;
                return <Button
                    accessibilityLabel={t("Preview Message")}
                    IconComponent={Icon}
                    onPress={() => {
                        const channelId = currentChannelId();
                        const draft: string = channelId ? getStore("DraftStore")?.getDraft?.(channelId, 0) ?? "" : "";
                        if (!channelId || !draft.trim()) {
                            showToast(t("Type a message to preview it"), findAssetId("EyeIcon"));
                            return;
                        }
                        receiveLocalMessage(channelId, {
                            id: localSnowflake(),
                            channel_id: channelId,
                            author: rawUser(getStore("UserStore")?.getCurrentUser?.() ?? { id: currentUserId(), username: "?" }),
                            content: draft,
                            timestamp: new Date().toISOString(),
                            edited_timestamp: null,
                            type: 0,
                            flags: 64,
                            mentions: [],
                            mention_roles: [],
                            attachments: [],
                            embeds: [],
                            state: "SENT",
                        });
                    }}
                />;
            },
        }));
    },
});
