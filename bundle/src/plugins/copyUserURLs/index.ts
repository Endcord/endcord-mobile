/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, copy } from "../hooks";

export default definePlugin({
    id: "endcord.copy-user-urls",
    name: "CopyUserURLs",
    description: tx("Copy a link to the profile of a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "copy-user-url",
            icon: "LinkIcon",
            label: () => t("Copy User URL"),
            visible: message => !!message.author?.id,
            onPress: message => copy(`https://discord.com/users/${message.author.id}`),
        }));
    },
});
