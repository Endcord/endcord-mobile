/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { addMessageAction, jumpTo, loadedMessages } from "../hooks";

export default definePlugin({
    id: "endcord.find-reply",
    name: "FindReply",
    description: tx("Jumps to the earliest reply to a message in a channel (lets you follow past conversations more easily)."),
    icon: "ArrowAngleLeftUpIcon",
    tags: ["Chat"],
    settings: {
        includePings: { type: "boolean", label: tx("Include mentions"), description: tx("Will also search for messages that @ the author directly"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(addMessageAction({
            key: "find-reply",
            icon: "ArrowAngleLeftUpIcon",
            label: () => t("Find Reply"),
            onPress: message => {
                const reply = loadedMessages(message.channel_id).find(m =>
                    m.id !== message.id && Number(m.id) > Number(message.id) && (
                        m.messageReference?.message_id === message.id
                        || store.includePings && (m.mentions ?? []).some((u: any) => (u?.id ?? u) === message.author?.id)
                    ));
                if (reply) jumpTo(message.channel_id, reply.id);
                else showToast(t("No replies to this message in the loaded messages"), findAssetId("CircleInformationIcon-primary"));
            },
        }));
    },
});
