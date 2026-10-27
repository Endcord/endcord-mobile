/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.random-facts",
    name: "RandomFacts",
    description: tx("Send a random fact with /fact"),
    icon: "BookCheckIcon",
    tags: ["Fun"],
    start: only({
        name: "fact",
        description: tx("Send a random fact"),
        run: async () => `🧠 ${(await json("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en"))?.text}`,
    }),
});
