/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * More of Endcord PC's message plugins: links to messages, spoilers, emojis, quotes, secret messages and archives.
 *
 * What more than one of these plugins uses.
 */

import { t } from "@core/i18n";

import { prompt, showText } from "../ui/dialogs";

export const preview = (text: string, length = 100) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

/**
 * Decryption, remembered for each message and password: rows are drawn again and again, and each decryption hashes
 * the whole message several times
 */
export function decryptionCache(decrypt: (content: string, password: string) => string | undefined) {
    const results = new Map<string, string | undefined>();
    return (message: any, password: string) => {
        const key = `${message.id}:${password}`;
        if (!results.has(key)) {
            if (results.size > 500) results.clear();
            results.set(key, decrypt(message.content ?? "", password));
        }
        return results.get(key);
    };
}

export function revealPrompt(title: string, unlock: (password: string) => string | undefined) {
    prompt({
        title,
        placeholder: t("Password"),
        confirm: t("Reveal"),
        onSubmit: password => {
            const text = unlock(password);
            if (text === undefined) throw new Error(t("Wrong password"));
            setTimeout(() => showText(title, text), 300);
        },
    });
}

export const INVISIBLE_MARKER = String.fromCharCode(0x2063, 0x2063);

const mapLetters = (text: string, upper: number, lower: number, digits?: number) => [...text].map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(upper + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(lower + code - 97);
    if (digits != null && code >= 48 && code <= 57) return String.fromCodePoint(digits + code - 48);
    return c;
}).join("");

const SMALL_CAPS = "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ";

const FLIPPED: Record<string, string> = Object.fromEntries([..."abcdefghijklmnopqrstuvwxyz.,!?'"].map((c, i) => [c, [..."ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz˙'¡¿,"][i]]));

const PIRATE: Array<[RegExp, string]> = [["hello", "ahoy"], ["hi", "ahoy"], ["my", "me"], ["friend", "matey"], ["friends", "hearties"], ["yes", "aye"], ["is", "be"], ["are", "be"], ["you", "ye"], ["your", "yer"], ["the", "th'"], ["money", "doubloons"], ["stop", "avast"], ["wow", "shiver me timbers"]]
    .map(([from, to]) => [new RegExp(`\\b${from}\\b`, "gi"), to]);

export const STYLES: Record<string, (text: string) => string> = {
    smallcaps: text => [...text.toLowerCase()].map(c => c >= "a" && c <= "z" ? SMALL_CAPS[c.charCodeAt(0) - 97] : c).join(""),
    upsidedown: text => [...text.toLowerCase()].map(c => FLIPPED[c] ?? c).reverse().join(""),
    bubble: text => mapLetters(text, 0x24B6, 0x24D0),
    fraktur: text => mapLetters(text, 0x1D56C, 0x1D586),
    script: text => mapLetters(text, 0x1D4D0, 0x1D4EA),
    doublestruck: text => mapLetters(text, 0x1D538, 0x1D552, 0x1D7D8),
    monospace: text => mapLetters(text, 0x1D670, 0x1D68A, 0x1D7F6),
    zalgo: text => [...text].map(c => c.trim() ? c + Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => String.fromCharCode(0x300 + Math.floor(Math.random() * 0x6F))).join("") : c).join(""),
    pirate: text => PIRATE.reduce((s, [re, to]) => s.replace(re, to), text) + " arr!",
};
