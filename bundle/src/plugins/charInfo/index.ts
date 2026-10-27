/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { answer, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.char-info",
    name: "CharInfo",
    description: tx("See the Unicode code points of every character in a text with /charinfo"),
    authors: [ENDCORD_AUTHOR],
    icon: "TextIcon",
    tags: ["Utility"],
    start: only({
        name: "charinfo",
        description: tx("The Unicode code point of each character"),
        options: [{ name: "text", description: tx("The text"), required: true }],
        run: ({ text }, ctx) => answer(ctx, [...String(text)].slice(0, 40).map(c =>
            `\`${c.trim() ? c : " "}\` U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join("\n")),
    }),
});
