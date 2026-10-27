/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { onIncomingMessage } from "../hooks";

const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));

export default definePlugin({
    id: "endcord.whitelisted-emojis",
    name: "WhitelistedEmojis",
    description: tx("Adds the ability to disable all message emojis except for a whitelisted set."),
    icon: "ReactionIcon",
    tags: ["Emotes", "Chat"],
    settings: {
        whitelist: { type: "string", label: tx("Allowed emojis"), description: tx("Names or IDs of the custom emojis still shown, separated by commas"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onIncomingMessage("whitelisted-emojis", message => {
            const content: string = message.content ?? "";
            // Your own messages keep their emojis, which is what editing them starts from
            if (!content.includes("<") || message.author?.id === currentUserId()) return;
            const allowed = ids(store.whitelist.toLowerCase());
            const replaced = content.replace(/<a?:(\w+):(\d+)>/g, (m, name: string, id: string) => allowed.has(name.toLowerCase()) || allowed.has(id) ? m : `:${name}:`);
            return replaced !== content ? { ...message, content: replaced } : undefined;
        }));
    },
});
