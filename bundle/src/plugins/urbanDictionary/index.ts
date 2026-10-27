/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { answer, clip, enc, json, number, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.urban-dictionary",
    name: "UrbanDictionary",
    description: tx("Look up slang on Urban Dictionary with /urban"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Utility", "Fun"],
    start: only({
        name: "urban",
        description: tx("What a slang word means, from Urban Dictionary"),
        options: [{ name: "term", description: tx("The word or phrase"), required: true }],
        run: async ({ term }, ctx) => {
            const data = await json(`https://api.urbandictionary.com/v0/define?term=${enc(String(term).trim())}`);
            const top = (data?.list ?? []).sort((a: any, b: any) => b.thumbs_up - a.thumbs_up)[0];
            if (!top) return answer(ctx, t("No definition found for {word}.", { word: term }));
            const strip = (s: string) => s.replace(/\[([^\]]+)\]/g, "$1");
            answer(ctx, `**${top.word}** · 👍 ${number(top.thumbs_up)}\n${clip(strip(top.definition))}${top.example ? `\n> ${clip(strip(top.example), 300).replace(/\n/g, "\n> ")}` : ""}`);
        },
    }),
});
