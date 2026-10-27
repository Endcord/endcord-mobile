/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { nativeColor, onMessageRow } from "../hooks";

function globToRegex(glob: string) {
    return new RegExp(glob.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, "."), "i");
}

export default definePlugin({
    id: "endcord.url-highlighter",
    name: "UrlHighlighter",
    description: tx("Colors messages with links that match your patterns"),
    icon: "LinkIcon",
    tags: ["Chat"],
    settings: {
        patterns: { type: "string", label: tx("Patterns"), description: tx("One per line, like *github.com* or *.example.org/*"), multiline: true, default: "" },
        color: { type: "string", label: tx("Color"), description: tx("Like #f0b232"), default: "#f0b232" },
    },
    start({ store, cleanup }) {
        // Compiled again only when the setting changes
        let source: string | undefined;
        let compiled: RegExp[] = [];
        const patternsOf = (text: string) => {
            if (text !== source) {
                source = text;
                compiled = text.split("\n").filter(p => p.trim()).map(globToRegex);
            }
            return compiled;
        };
        cleanup(onMessageRow("url-highlighter", (row, message) => {
            const urls: string[] = String(message.content ?? "").match(/https?:\/\/\S+/g) ?? [];
            if (!urls.length) return;
            const patterns = patternsOf(store.patterns);
            if (!urls.some(u => patterns.some(p => p.test(u)))) return;
            const color = nativeColor(store.color.trim() || "#f0b232");
            if (color !== undefined) row.textColor = color;
        }));
    },
});
