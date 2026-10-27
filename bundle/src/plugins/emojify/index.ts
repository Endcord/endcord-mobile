/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { only } from "../shared/utility";

export default definePlugin({
    id: "endcord.emojify",
    name: "Emojify",
    description: tx("Write a message in big letter emojis with /emojify"),
    icon: "ReactionIcon",
    tags: ["Fun", "Chat"],
    start: only({
        name: "emojify",
        description: tx("Send text as letter emojis"),
        options: [{ name: "text", description: tx("The text"), required: true }],
        run: ({ text }) => {
            const digits = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
            return [...String(text).toLowerCase()].map(c =>
                c >= "a" && c <= "z" ? `:regional_indicator_${c}:` : c >= "0" && c <= "9" ? `:${digits[+c]}:` : c === "?" ? ":grey_question:" : c === "!" ? ":grey_exclamation:" : c === " " ? "   " : c,
            ).join(" ").slice(0, 2000);
        },
    }),
});
