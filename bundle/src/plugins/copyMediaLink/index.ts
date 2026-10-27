/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, copy } from "../hooks";
import { mediaOf, pickOne } from "../shared/actions";

export default definePlugin({
    id: "endcord.copy-media-link",
    name: "CopyMediaLink",
    description: tx("Copy the link of a message's images, videos and files from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "copy-media-link",
            icon: "LinkIcon",
            label: () => t("Copy Media Link"),
            visible: message => mediaOf(message).length > 0,
            onPress: message => pickOne(t("Copy Media Link"), mediaOf(message), m => m.label, m => copy(m.url)),
        }));
    },
});
