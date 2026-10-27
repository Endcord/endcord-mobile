/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { command } from "../hooks";
import { mapChars, message } from "../shared/text";

const LEET: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", b: "8", g: "9", l: "1" };

export default definePlugin({
    id: "endcord.leet-text",
    name: "LeetText",
    description: tx("/leet rewrites your message in 1337 5p34k."),
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "leet",
            description: tx("Convert to leetspeak"),
            options: [message()],
            run: ({ message }) => mapChars(message, c => LEET[c.toLowerCase()] ?? c),
        }));
    },
});
