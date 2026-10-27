/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { onIncomingMessage } from "../hooks";
import { isBlocked } from "../shared/filters";

const isIgnored = (userId?: string) => !!userId && !!getStore("RelationshipStore")?.isIgnored?.(userId);

export default definePlugin({
    id: "endcord.no-blocked-messages",
    name: "NoBlockedMessages",
    description: tx("Hides all blocked/ignored messages from chat completely"),
    authors: [ENDCORD_AUTHOR],
    icon: "DenyIcon",
    tags: ["Chat"],
    settings: {
        ignoreBlockedMessages: { type: "boolean", label: tx("Hide blocked users"), description: tx("Hide messages from users you blocked"), default: true },
        hideIgnored: { type: "boolean", label: tx("Hide ignored users"), description: tx("Hide messages from users you ignored"), default: true },
    },
    start({ store, cleanup }) {
        cleanup(onIncomingMessage("no-blocked-messages", message => {
            const author = message.author?.id;
            if (store.ignoreBlockedMessages && isBlocked(author) || store.hideIgnored && isIgnored(author)) return null;
        }));
    },
});
