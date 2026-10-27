/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { answer, json, only } from "../shared/utility";
import { choose } from "../ui/dialogs";

function decodeEntities(text: string) {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", eacute: "é", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
    return text.replace(/&(#x?[\da-f]+|\w+);/gi, (m, e: string) =>
        e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : named[e.toLowerCase()] ?? m);
}

export default definePlugin({
    id: "endcord.trivia",
    name: "Trivia",
    description: tx("Answer a random trivia question with /trivia"),
    icon: "CircleQuestionIcon",
    tags: ["Fun"],
    start: only({
        name: "trivia",
        description: tx("A random trivia question to answer"),
        run: async (_, ctx) => {
            const q = (await json("https://opentdb.com/api.php?amount=1&type=multiple"))?.results?.[0];
            if (!q) return answer(ctx, t("No question came back; try again in a few seconds."));
            const right = decodeEntities(q.correct_answer);
            const options = [right, ...q.incorrect_answers.map(decodeEntities)].sort(() => Math.random() - 0.5);
            choose(decodeEntities(q.question), options.map(o => ({ label: o, value: o })), picked => {
                if (picked === right) showToast(t("Correct!"), findAssetId("CheckmarkLargeIcon"));
                else showToast(t("Wrong, it was {answer}", { answer: right }), findAssetId("CircleXIcon-primary"));
            });
        },
    }),
});
