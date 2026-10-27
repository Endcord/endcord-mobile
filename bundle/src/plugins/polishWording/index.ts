/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onSend, outsideCode } from "../hooks";
import { capitalizeSentences, splitList } from "../shared/compose";

// PolishWording: contractions get their apostrophes back (or are written out), sentences start with a capital and end
// with a period
const CONTRACTIONS: Record<string, string> = {
    "wasn't": "was not", "can't": "cannot", "don't": "do not", "won't": "will not", "isn't": "is not", "aren't": "are not",
    "haven't": "have not", "hasn't": "has not", "hadn't": "had not", "doesn't": "does not", "didn't": "did not",
    "shouldn't": "should not", "wouldn't": "would not", "couldn't": "could not", "that's": "that is", "what's": "what is",
    "there's": "there is", "how's": "how is", "where's": "where is", "when's": "when is", "who's": "who is", "why's": "why is",
    "you'll": "you will", "i'll": "I will", "they'll": "they will", "it'll": "it will", "i'm": "I am", "you're": "you are",
    "they're": "they are", "he's": "he is", "she's": "she is", "i've": "I have", "you've": "you have", "we've": "we have",
    "they've": "they have", "you'd": "you would", "he'd": "he would", "she'd": "she would", "it'd": "it would",
    "we'd": "we would", "they'd": "they would", "y'all": "you all", "here's": "here is",
};

// Without the ones that are real words too (were, well, hell, its, ...)
const MISSING_APOSTROPHE = Object.fromEntries(Object.keys(CONTRACTIONS).map(c => [c.replace(/'/g, ""), c]).filter(([w]) => !["its", "were", "well", "hell", "shell", "wed", "id", "hed", "shed", "whos", "cant", "wont"].includes(w)));

/** Gives `to` the capitalisation `from` had, letter by letter */
function keepCase(from: string, to: string) {
    const caps = [...from].filter(c => /[a-z]/i.test(c)).map(c => c === c.toUpperCase());
    let i = 0;
    return [...to].map(c => {
        if (!/[a-z]/i.test(c)) return c;
        const upper = caps[Math.min(i++, caps.length - 1)];
        return upper ? c.toUpperCase() : c.toLowerCase();
    }).join("");
}

function wordsRegex(words: string[]) {
    return new RegExp(`\\b(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
}

const MISSING_RE = wordsRegex(Object.keys(MISSING_APOSTROPHE));

const CONTRACTION_RE = wordsRegex(Object.keys(CONTRACTIONS));

export default definePlugin({
    id: "endcord.polish-wording",
    name: "PolishWording",
    description: tx("Tweaks your messages to make them look nicer and have better grammar. See settings"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        fixApostrophes: { type: "boolean", label: tx("Fix apostrophes"), description: tx("Ensure contractions contain apostrophes."), default: true },
        expandContractions: { type: "boolean", label: tx("Expand contractions"), description: tx("Expand contractions."), default: false },
        fixCapitalization: { type: "boolean", label: tx("Fix capitalization"), description: tx("Capitalize sentences."), default: false },
        fixPunctuation: { type: "boolean", label: tx("Fix punctuation"), description: tx("End your messages with a period."), default: false },
        blockedWords: {
            type: "string",
            label: tx("Words to leave lowercase"),
            description: tx("Words that will not be capitalized (comma separated)."),
            default: "",
        },
    },
    start({ store, cleanup }) {
        cleanup(onSend("polish-wording", content => outsideCode(content, text => {
            if (store.fixApostrophes || store.expandContractions) text = text.replace(MISSING_RE, m => keepCase(m, MISSING_APOSTROPHE[m.toLowerCase()] ?? m));
            if (store.expandContractions) text = text.replace(CONTRACTION_RE, m => keepCase(m, CONTRACTIONS[m.toLowerCase()] ?? m));
            if (store.fixCapitalization) text = capitalizeSentences(text, splitList(store.blockedWords));
            if (store.fixPunctuation) text = text.replace(/([a-z0-9])(\s*)$/i, "$1.$2");
            return text;
        }), 11));
    },
});
