/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, enc, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.dictionary",
    name: "Dictionary",
    description: tx("Look up what an English word means with /define"),
    icon: "BookCheckIcon",
    tags: ["Utility"],
    start: only({
        name: "define",
        description: tx("What an English word means"),
        options: [{ name: "word", description: tx("The word"), required: true }],
        run: async ({ word }, ctx) => {
            const [entry] = await json(`https://api.dictionaryapi.dev/api/v2/entries/en/${enc(String(word).trim())}`).catch(() => [undefined]);
            if (!entry) return answer(ctx, t("No definition found for {word}.", { word }));
            const lines = (entry.meanings ?? []).slice(0, 3).flatMap((m: any) => (m.definitions ?? []).slice(0, 2).map((d: any, i: number) =>
                `${i ? "  " : `*${m.partOfSpeech}* `}${d.definition}${d.example ? `\n  > ${d.example}` : ""}`));
            answer(ctx, `**${entry.word}** ${entry.phonetic ?? ""}\n${lines.join("\n")}`);
        },
    }),
});
