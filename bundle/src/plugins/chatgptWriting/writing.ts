/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ChatGPTWriting's rewriting, as Endcord PC does it: the message's tone from its words, a matching kaomoji or emoji at
 * the end, and simple autocorrect. Two of PC's corrections are left out because they break right English: "were"
 * became "we're", and "gonna" became "gon na" (it's "going to" here). PC also joined a message's lines into one when
 * it capitalised them; here the line breaks stay. Unlike PC, code, links and Discord's emoji, mentions and other
 * <...> tokens are never corrected, and a message that's only a link (a sticker, a GIF) is sent as it is.
 */

import { outsideCode } from "../hooks";

const KAOMOJIS: Record<string, string[]> = {
    happy: ["ヽ(´▽`)/", "<(￣︶￣)>", "o(≧▽≦)o", "(─‿‿─)♡", "(*≧ω≦*)"],
    sad: ["ಥ_ಥ", "(´・ω・`)", "(╥_╥)", "｡ﾟ･ (>﹏<) ･ﾟ｡", "(ノ_<。)"],
    angry: ["ヽ(｀Д´)ﾉ", "ヽ(ｏ`皿′ｏ)ﾉ", "(╬ Ò﹏Ó)", "┌∩┐(◣_◢)┌∩┐", "┻━┻ ︵ヽ(`Д´)ﾉ︵ ┻━┻"],
    confused: ["(•ิ_•ิ)?", "(◎_◎;)", "(－ω－)", "(・_・ヂ", "(?_?)"],
    loving: ["(⁄ ⁄>⁄ ▽ ⁄<⁄ ⁄)", "ღゝ◡╹)ノ♡", "♥‿♥", "(´∀`)♡", "(◕‿◕)♡"],
    smug: ["ಠ_ಠ", "(￣ー￣)", "(~_~)", "(↼_↼)", "¬_¬"],
    excited: ["(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧", "✌(◕‿-)✌", "(≧◡≦)", "o(*≧▽≦)o", "ヾ(^▽^*)"],
    sleepy: ["(ᴗ_ᴗ)", "(－ω－) zzZ", "(。-ω-)zzz", "(-.-)Zzz...", "(˘ω˘)"],
    crying: ["(ಥ﹏ಥ)", "o(╥﹏╥)o", "(;_;)", "(ノ_<。)", "(T_T)"],
    default: ["(◕‿◕)", "( ˘ᴗ˘ )", "(｡•̀ᴗ-)✧", "(*ᴗ͈ˬᴗ͈)", "( ˘◡˘ )"],
};

const EMOJIS: Record<string, string[]> = {
    happy: ["😊", "😄", "🥰", "✨", "💕"],
    sad: ["😢", "💔", "😞", "🥺", "💧"],
    angry: ["😠", "😤", "💢", "🔥", "😡"],
    confused: ["😕", "🤔", "😵‍💫", "❓", "😬"],
    loving: ["🥰", "💕", "😍", "❤️", "💖"],
    smug: ["😏", "😌", "😎", "😼", "💅"],
    excited: ["🎉", "🤩", "🙌", "💯", "🔥"],
    sleepy: ["😴", "💤", "😪", "🥱", "😇"],
    crying: ["😭", "😿", "💔", "🥺", "😩"],
    default: ["✨", "👍", "❤️", "😊", "💫"],
};

const REPLACEMENTS: Record<string, string> = {
    teh: "the", thier: "their", recieve: "receive", occured: "occurred", seperate: "separate", definately: "definitely",
    accomodate: "accommodate", occurence: "occurrence", untill: "until", becuase: "because", writting: "writing",
    truely: "truly", happend: "happened", wierd: "weird", thats: "that's", dont: "don't", cant: "can't", wont: "won't",
    im: "I'm", ive: "I've", youre: "you're", theyre: "they're", shouldve: "should've", couldve: "could've",
    wouldve: "would've", doesnt: "doesn't", isnt: "isn't", wasnt: "wasn't", hasnt: "hasn't", havent: "haven't",
    hadnt: "hadn't", wouldnt: "wouldn't", couldnt: "couldn't", shouldnt: "shouldn't", didnt: "didn't", arent: "aren't",
    aint: "ain't", gonna: "going to", wanna: "want to", gotta: "got to", kinda: "kind of", sorta: "sort of",
    outta: "out of", lemme: "let me", gimme: "give me",
};

const REPLACEMENT_RE = new RegExp(`\\b(${Object.keys(REPLACEMENTS).join("|")})\\b`, "gi");

// In Endcord PC's order: the first tone whose words appear wins
const TONES: Array<[string, RegExp]> = [
    ["happy", /\b(happy|glad|excited|love|amazing|awesome|great|wonderful|fantastic|joy|yay|woohoo)\b/i],
    ["sad", /\b(sad|cry|tears|miss|lonely|unhappy|upset|depressed|unfortunately|sorry)\b/i],
    ["angry", /\b(angry|mad|furious|hate|annoying|stupid|idiot|worst|rage)\b/i],
    ["confused", /\b(confused|confusing|what|why|how|question|don't understand)\b/i],
    ["loving", /\b(love|love you|love you so much|crush|heart|valentine|babe)\b/i],
    ["smug", /\b(satisfy|proud|nice|perfect|better|well|obviously|of course)\b/i],
    ["excited", /\b(excited|wow|omg|holy|amazing|incredible|can't wait|soon)\b/i],
    ["sleepy", /\b(tired|sleepy|exhausted|sleep|bed|goodnight|night|zzz)\b/i],
    ["crying", /\b(cry|crying|sob|tears|sobs)\b/i],
];

export function detectTone(content: string): string {
    return TONES.find(([, words]) => words.test(content))?.[0] ?? "default";
}

/** The start of a link, of any kind (https://, steam://...) */
const LINK = /[a-z][a-z0-9+.-]{0,30}:\/\//i;

/**
 * What autocorrect leaves as it is outside code: links, and Discord's <...> tokens (custom emoji, mentions, channels,
 * timestamps, links in angle brackets, and slash commands, whose names can have spaces)
 */
const UNTOUCHED = /([a-z][a-z0-9+.-]{0,30}:\/\/[^\s<]+|<\/[^<>\n]{1,100}:\d{1,20}>|<[^<>\s]{1,200}>)/i;

/** A message that's only a link, like a sticker or a GIF sent as one */
const ONLY_LINK = /^<?[a-z][a-z0-9+.-]{0,30}:\/\/[^\s<>]+>?$/i;

/** Changes a message's words only: never code (like the other text plugins), links or Discord's <...> tokens */
function inWords(content: string, fn: (text: string) => string): string {
    return outsideCode(content, text => text.split(UNTOUCHED).map((part, i) => i % 2 ? part : fn(part)).join(""));
}

/** Whether a message ends with a word, so a period can go after it: not with code, a link or a token */
function endsWithWord(text: string) {
    const last = text.split(/\s+/).pop() ?? "";
    return !!last && !/[`>]$/.test(last) && !LINK.test(last);
}

/**
 * Fixes common misspellings and missing apostrophes, starts sentences with a capital and ends with a period. Code,
 * links and Discord's <...> tokens stay as they are, so a custom emoji named :im: or a link to /dont still works.
 */
export function autocorrect(content: string): string {
    let corrected = inWords(content, text => text
        .replace(REPLACEMENT_RE, word => {
            const right = REPLACEMENTS[word.toLowerCase()] ?? word;
            // "Dont" at the start of a sentence stays capitalised
            return word[0] !== word[0].toLowerCase() ? right[0].toUpperCase() + right.slice(1) : right;
        })
        // PC put one space there, which joined the lines of a message; the spacing that was there is kept
        .replace(/([.!?])(\s+)([a-z])/g, (_, punctuation: string, space: string, letter: string) => punctuation + space + letter.toUpperCase()));
    // A message that starts with a link keeps it as it is
    if (/^[a-z]/i.test(corrected) && !/^[a-z][a-z0-9+.-]{0,30}:\/\//i.test(corrected)) corrected = corrected[0].toUpperCase() + corrected.slice(1);
    const end = corrected.trim();
    if (end && !/[.!?]$/.test(end) && endsWithWord(end)) corrected = `${end}.`;
    return corrected;
}

export interface WritingOptions {
    kaomoji: boolean;
    emoji: boolean;
    autocorrect: boolean;
}

/** The message as ChatGPTWriting sends it, or undefined to leave it as it is (empty, with a code block, or only a link) */
export function rewrite(content: string, options: WritingOptions, random: () => number = Math.random): string | undefined {
    if (content.includes("```")) return undefined;
    let text = content.trim();
    if (!text || ONLY_LINK.test(text)) return undefined;
    const tone = detectTone(text);
    const pick = (list: string[]) => list[Math.floor(random() * list.length)];
    if (options.autocorrect) text = autocorrect(text);
    if (options.kaomoji) text += ` ${pick(KAOMOJIS[tone] ?? KAOMOJIS.default)}`;
    if (options.emoji) text += ` ${pick(EMOJIS[tone] ?? EMOJIS.default)}`;
    return text;
}
