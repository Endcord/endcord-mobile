/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onSend } from "../hooks";

export default definePlugin({
    id: "endcord.normalize-message-links",
    name: "NormalizeMessageLinks",
    description: tx("Strip canary/ptb from message links"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Chat", "Utility"],
    start({ cleanup }) {
        cleanup(onSend("normalize-message-links", content => content.replace(/https:\/\/(?:canary\.|ptb\.)discord(?:app)?\.com\/channels\//g, "https://discord.com/channels/"), 50));
    },
});
