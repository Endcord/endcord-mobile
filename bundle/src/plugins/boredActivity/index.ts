/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { answer, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.bored-activity",
    name: "BoredActivity",
    description: tx("Get an idea of something to do with /bored"),
    authors: [ENDCORD_AUTHOR],
    icon: "SparklesIcon",
    tags: ["Fun"],
    start: only({
        name: "bored",
        description: tx("An idea of something to do"),
        run: async (_, ctx) => {
            const a = await json("https://bored-api.appbrewery.com/random");
            answer(ctx, `🎯 **${a.activity}** · ${a.type}${a.participants > 1 ? ` · ${t("{count} people", { count: a.participants })}` : ""}`);
        },
    }),
});
