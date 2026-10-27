/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.quotes",
    name: "Quotes",
    description: tx("Send a random famous quote with /quote"),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Fun"],
    start: only({
        name: "quote",
        description: tx("Send a random famous quote"),
        run: async () => {
            const [q] = await json("https://zenquotes.io/api/random");
            return `> ${q.q}\n— ${q.a}`;
        },
    }),
});
