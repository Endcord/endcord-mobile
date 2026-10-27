/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, copy } from "../hooks";

export default definePlugin({
    id: "endcord.copy-user-mention",
    name: "CopyUserMention",
    description: tx("Copy the mention of a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "AtIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "copy-user-mention",
            icon: "AtIcon",
            label: () => t("Copy User Mention"),
            visible: message => !!message.author?.id,
            onPress: message => copy(`<@${message.author.id}>`),
        }));
    },
});
