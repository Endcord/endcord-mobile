/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * What SecretGuard looks for, the same as Endcord PC's (secretGuard/index.ts there). Written without lookbehind, which
 * not every JavaScript engine React Native has had reads.
 */

import { tx } from "@core/i18n";

interface Secret {
    /** What the person is told the message contains, in English, marked for translation */
    name: string;
    test(text: string): boolean;
}

const pattern = (re: RegExp) => (text: string) => re.test(text);

function luhn(digits: string) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        let d = digits.charCodeAt(digits.length - 1 - i) - 48;
        if (i % 2 === 1 && (d *= 2) > 9) d -= 9;
        sum += d;
    }
    return sum % 10 === 0;
}

// Endcord PC's /(?<![\d.,])(?:\d[ -]?){14,15}\d(?![\d.,])/g, with the lookbehind checked by hand below
const CARD = /(?:\d[ -]?){14,15}\d(?![\d.,])/g;

/** Sixteen digits that look like a card, or fifteen like an Amex one, standing on their own */
export function hasCardNumber(text: string) {
    // The same matches, in the same order, as matchAll with PC's expression: one that follows a digit or a decimal point
    // isn't one there, so the search goes on from the next character; after one that is, from its end
    let from = 0;
    while (from < text.length) {
        CARD.lastIndex = from;
        const m = CARD.exec(text);
        if (!m) break;
        if (m.index > 0 && /[\d.,]/.test(text[m.index - 1])) {
            from = m.index + 1;
            continue;
        }
        const digits = m[0].replace(/\D/g, "");
        // Only the lengths and first digits cards have: Discord's ids are 17 to 19 digits, so they never match
        const looksLikeCard = digits.length === 16 ? /^(?:4|5[1-5]|2[2-7]|6)/.test(digits) : /^3[47]/.test(digits);
        if (looksLikeCard && luhn(digits)) return true;
        from = m.index + m[0].length;
    }
    return false;
}

/** "password: hunter2" and the same in the languages Endcord speaks, at the start of a word */
const PASSWORD = /(?:^|[^\wÀ-ɏЀ-ӿ])(?:password|passwd|pwd|şifre|parola|contraseña|mot de passe|пароль)\s*[:=]\s*\S{4,}/i;

const SECRETS: Secret[] = [
    // A Discord token is the account's id in base64, a timestamp and a signature, joined by dots
    { name: tx("a Discord token"), test: pattern(/\b[MNO][\w-]{23,27}\.[\w-]{6}\.[\w-]{27,40}\b|\bmfa\.[\w-]{80,}/) },
    { name: tx("a webhook link"), test: pattern(/discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]{50,}/i) },
    { name: tx("a private key"), test: pattern(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/) },
    { name: tx("a GitHub token"), test: pattern(/\b(?:gh[pousr]_[A-Za-z\d]{36,}|github_pat_\w{60,})\b/) },
    { name: tx("an API key"), test: pattern(/\b(?:sk-(?:ant-|proj-)?[\w-]{32,}|sk_live_[A-Za-z\d]{24,}|AKIA[A-Z\d]{16}|AIza[\w-]{35}|xox[abprs]-[A-Za-z\d-]{20,})\b/) },
    { name: tx("a login token"), test: pattern(/\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{20,}/) },
];

/** The first kind of secret the text seems to have, as its English name, or undefined */
export function findSecret(text: string, { cards = true, passwords = true } = {}): string | undefined {
    const found = SECRETS.find(secret => secret.test(text));
    if (found) return found.name;
    if (cards && hasCardNumber(text)) return tx("a card number");
    if (passwords && PASSWORD.test(text)) return tx("a password");
    return undefined;
}
