/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { nativeColor, onMessageRow } from "../hooks";

/** The longest link checked: links come from other people's messages, and are checked every time a row is drawn */
const MAX_URL = 2048;

/**
 * Whether [text] holds a match of [glob] ("*" any run of characters, "?" any one), both already in lowercase. A pattern
 * made into a regular expression (".*github\.com.*") backtracks for as long as the link squared, or worse with more
 * stars; this never takes longer than the link times the pattern
 */
export function globMatches(glob: string, text: string): boolean {
    const p = `*${glob}*`;
    let i = 0, j = 0, star = -1, mark = 0;
    while (i < text.length) {
        // A star in the pattern is always a wildcard, even where the link has a "*" of its own
        if (j < p.length && p[j] === "*") {
            star = j++;
            mark = i;
        } else if (j < p.length && (p[j] === "?" || p[j] === text[i])) {
            i++;
            j++;
        } else if (star !== -1) {
            j = star + 1;
            i = ++mark;
        } else {
            return false;
        }
    }
    while (j < p.length && p[j] === "*") j++;
    return j === p.length;
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
        let compiled: string[] = [];
        const patternsOf = (text: string) => {
            if (text !== source) {
                source = text;
                compiled = text.split("\n").map(p => p.trim().toLowerCase()).filter(Boolean);
            }
            return compiled;
        };
        cleanup(onMessageRow("url-highlighter", (row, message) => {
            const urls: string[] = String(message.content ?? "").match(/https?:\/\/\S+/g) ?? [];
            if (!urls.length) return;
            const patterns = patternsOf(store.patterns);
            if (!urls.some(u => patterns.some(p => globMatches(p, u.slice(0, MAX_URL).toLowerCase())))) return;
            const color = nativeColor(store.color.trim() || "#f0b232");
            if (color !== undefined) row.textColor = color;
        }));
    },
});
