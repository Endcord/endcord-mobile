/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId } from "../common";
import { onIncomingMessage } from "../hooks";

function keywordMatcher(words: string, useRegex: boolean, caseSensitive: boolean): (text: string) => boolean {
    const list = words.split(",").map(w => w.trim()).filter(Boolean);
    if (!list.length) return () => false;
    if (useRegex) {
        const patterns = list.flatMap(w => {
            try {
                return [new RegExp(w, caseSensitive ? "" : "i")];
            } catch {
                return [];
            }
        });
        return text => patterns.some(p => p.test(text));
    }
    const needles = caseSensitive ? list : list.map(w => w.toLowerCase());
    return text => {
        const haystack = caseSensitive ? text : text.toLowerCase();
        return needles.some(n => haystack.includes(n));
    };
}

export default definePlugin({
    id: "endcord.block-keywords",
    name: "BlockKeywords",
    description: tx("Blocks messages containing specific user-defined keywords, as if the user sending them was blocked."),
    authors: [ENDCORD_AUTHOR],
    icon: "DenyIcon",
    tags: ["Chat", "Privacy"],
    settings: {
        blockedWords: { type: "string", label: tx("Blocked words"), description: tx("Comma-separated list of words to block"), default: "" },
        useRegex: { type: "boolean", label: tx("Regular expressions"), description: tx("Use each value as a regular expression when checking message content (advanced)"), default: false },
        caseSensitive: { type: "boolean", label: tx("Case sensitive"), description: tx("Whether to use a case sensitive search or not"), default: false },
        ignoreOwn: { type: "boolean", label: tx("Never hide my messages"), description: tx("Your own messages are always shown"), default: true },
    },
    start({ store, cleanup }) {
        // Built again only when the settings change, not for each of the many messages a chat loads
        let key = "";
        let matches: (text: string) => boolean = () => false;
        const matcher = () => {
            const current = `${store.useRegex}:${store.caseSensitive}:${store.blockedWords}`;
            if (current !== key) {
                key = current;
                matches = keywordMatcher(store.blockedWords, store.useRegex, store.caseSensitive);
            }
            return matches;
        };
        cleanup(onIncomingMessage("block-keywords", message => {
            if (store.ignoreOwn && message.author?.id === currentUserId()) return;
            const text = [message.content, ...(message.embeds ?? []).flatMap((e: any) => [e.title, e.description])].filter(Boolean).join("\n");
            if (text && matcher()(text)) return null;
        }));
    },
});
