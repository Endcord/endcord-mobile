/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { command } from "../hooks";
import { message } from "../shared/text";

export default definePlugin({
    id: "endcord.reverse-text",
    name: "ReverseText",
    description: tx("/reverse flips your message backwards."),
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "reverse",
            description: tx("Reverse your text"),
            options: [message()],
            run: ({ message }) => [...message].reverse().join(""),
        }));
    },
});
