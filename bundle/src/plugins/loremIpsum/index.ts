/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { copy, insertText } from "../hooks";
import { only } from "../shared/utility";

export default definePlugin({
    id: "endcord.lorem-ipsum",
    name: "LoremIpsum",
    description: tx("Put placeholder text in the message box with /lorem"),
    icon: "TextIcon",
    tags: ["Utility"],
    start: only({
        name: "lorem",
        description: tx("Placeholder text, put in the message box"),
        options: [{ name: "sentences", description: tx("How many sentences (1 to 20)"), type: "integer" }],
        run: ({ sentences }, ctx) => {
            const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat".split(" ");
            const count = Math.min(Math.max(Number(sentences) || 3, 1), 20);
            const text = Array.from({ length: count }, (_, i) => {
                const length = 6 + (i * 7 + 3) % 9;
                const sentence = Array.from({ length }, (_, j) => words[(i * 11 + j * 5) % words.length]).join(" ");
                return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
            }).join(" ");
            if (!insertText(ctx.channel.id, text)) copy(text);
        },
    }),
});
