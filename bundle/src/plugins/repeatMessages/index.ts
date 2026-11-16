/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction, send } from "../hooks";

export default definePlugin({
    id: "endcord.repeat-messages",
    name: "RepeatMessages",
    description: tx("Send a message again from the message menu"),
    icon: "RetryIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "repeat-messages",
            icon: "RetryIcon",
            label: () => t("Repeat Message"),
            visible: message => !!message.content?.trim(),
            // Someone else's text, sent as yours: its @everyone, roles and people aren't pinged again
            onPress: message => send(message.channel_id, message.content, { allowedMentions: { parse: [], replied_user: false } }),
        }));
    },
});
