/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's text commands: each one turns what you type into something else and sends it.
 *
 * What more than one of these plugins uses.
 */

import { tx } from "@core/i18n";

export const message = (description = tx("Your message")) => ({ name: "message", description, required: true });

/** Maps every code point, so emoji and other characters outside the BMP stay whole */
export const mapChars = (text: string, fn: (c: string) => string) => [...text].map(fn).join("");

export function toBold(text: string) {
    return mapChars(text, c => {
        const code = c.codePointAt(0)!;
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D400 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D41A + code - 97);
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7CE + code - 48);
        return c;
    });
}

export const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/** The same score for the same two names, whichever order they're in */
export function shipScore(a: string, b: string) {
    const key = [a.toLowerCase(), b.toLowerCase()].sort().join("💕");
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return h % 101;
}

/** + - * / % and parentheses, without eval */
export function calculate(expression: string): number {
    const tokens = expression.match(/\d*\.?\d+(?:e[+-]?\d+)?|[-+*/%()]/gi) ?? [];
    if (tokens.join("") !== expression.replace(/\s+/g, "")) throw new Error("Invalid expression");
    let i = 0;
    const peek = () => tokens[i];
    const take = () => tokens[i++];

    function primary(): number {
        const token = take();
        if (token === "(") {
            const value = sum();
            if (take() !== ")") throw new Error("Missing )");
            return value;
        }
        if (token === "-") return -primary();
        if (token === "+") return primary();
        const n = Number(token);
        if (token === undefined || Number.isNaN(n)) throw new Error("Expected a number");
        return n;
    }
    function product(): number {
        let value = primary();
        while (peek() === "*" || peek() === "/" || peek() === "%") {
            const op = take();
            const right = primary();
            value = op === "*" ? value * right : op === "/" ? value / right : value % right;
        }
        return value;
    }
    function sum(): number {
        let value = product();
        while (peek() === "+" || peek() === "-") value = take() === "+" ? value + product() : value - product();
        return value;
    }

    const result = sum();
    if (i !== tokens.length) throw new Error("Unexpected input");
    return result;
}

const UWU_ENDINGS = ["rawr x3", "OwO", "UwU", "o.O", "-.-", ">w<", "(⑅˘꒳˘)", "(ꈍᴗꈍ)", "(˘ω˘)", "(U ᵕ U❁)", "σωσ", "òωó", "(///ˬ///✿)", "(U ﹏ U)", "( ͡o ω ͡o )", "ʘwʘ", ":3", ":3", ":3", "XD", "nyaa~~", "mya", ">_<", "😳", "🥺", "😳😳😳", "rawr", "^^", "^^;;", "(ˆ ﻌ ˆ)♡", "^•ﻌ•^", "/(^•ω•^)", "(✿oωo)"];

const UWU_WORDS: Array<[RegExp, string]> = [["small", "smol"], ["cute", "kawaii"], ["fluff", "floof"], ["love", "luv"], ["stupid", "baka"], ["what", "nani"], ["meow", "nya"], ["hello", "hewwo"]]
    .map(([from, to]) => [new RegExp(`\\b${from}\\b`, "gi"), to]);

export function uwuify(text: string) {
    const words = text.match(/\S+|\s+/g) ?? [];
    const out = words.map(word => {
        if (/^\s+$/.test(word) || word.startsWith("https://") || [...word].every(c => c === word[0])) return word;
        let replaced = word;
        for (const [re, to] of UWU_WORDS) replaced = replaced.replace(re, to);
        return replaced !== word ? replaced : word.replace(/n(?=[aeo])/g, "ny").replace(/l|r/g, "w");
    });
    return `${out.join("")} ${pick(UWU_ENDINGS)}`;
}

const MORSE: Record<string, string> = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
    N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
    0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", " ": "/",
};

const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export function morse(text: string) {
    if (/^[.\-/ ]+$/.test(text)) {
        const raw = text.split(" ").map(code => FROM_MORSE[code] ?? "").join("").toLowerCase();
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return [...text.toUpperCase()].map(c => MORSE[c] ?? "").filter(Boolean).join(" ");
}
