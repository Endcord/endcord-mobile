/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.cat-facts",
    name: "CatFacts",
    description: tx("Send a random fact about cats with /catfact"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Fun"],
    start: only({
        name: "catfact",
        description: tx("Send a fact about cats"),
        run: async () => `🐱 ${(await json("https://catfact.ninja/fact"))?.fact}`,
    }),
});
