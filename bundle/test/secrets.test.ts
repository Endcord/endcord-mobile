// SecretGuard's checks on mobile, side by side with Endcord PC's expressions (secretGuard/index.ts there, lookbehind
// and all), which Bun's engine reads
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";
mock.module(SRC + "core/i18n/index.ts", () => ({ tx: (s: string) => s, t: (s: string) => s }));
const { findSecret, hasCardNumber } = await import(SRC + "plugins/secretGuard/secrets.ts");

function luhn(digits: string) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        let d = digits.charCodeAt(digits.length - 1 - i) - 48;
        if (i % 2 === 1 && (d *= 2) > 9) d -= 9;
        sum += d;
    }
    return sum % 10 === 0;
}
const pcCard = (text: string) => [...text.matchAll(/(?<![\d.,])(?:\d[ -]?){14,15}\d(?![\d.,])/g)].some(m => {
    const digits = m[0].replace(/\D/g, "");
    const looksLikeCard = digits.length === 16 ? /^(?:4|5[1-5]|2[2-7]|6)/.test(digits) : /^3[47]/.test(digits);
    return looksLikeCard && luhn(digits);
});
const pcPassword = (text: string) => /(?<![\w\u00c0-\u024f\u0400-\u04ff])(?:password|passwd|pwd|\u015fifre|parola|contrase\u00f1a|mot de passe|\u043f\u0430\u0440\u043e\u043b\u044c)\s*[:=]\s*\S{4,}/i.test(text);

let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const int = (n: number) => Math.floor(rand() * n);
const pick = <T,>(list: T[]) => list[int(list.length)];

function validCard() {
    const length = rand() < 0.3 ? 15 : 16;
    const prefix = length === 15 ? pick(["34", "37"]) : pick(["4", "51", "55", "22", "27", "6", "1", "9", "50"]);
    let digits = prefix;
    while (digits.length < length - 1) digits += int(10);
    for (let check = 0; check < 10; check++) if (luhn(digits + check)) return digits + check;
    throw new Error("no check digit");
}

function cardText() {
    const parts: string[] = [];
    for (let i = int(5); i >= 0; i--) {
        switch (int(6)) {
            case 0: {
                const digits = validCard();
                const sep = pick(["", " ", "-", " ", "  "]);
                parts.push(rand() < 0.5 ? digits.replace(/(\d{4})(?=\d)/g, `$1${sep}`) : [...digits].map(d => d + (rand() < 0.2 ? pick([" ", "-"]) : "")).join("").trim());
                break;
            }
            case 1: parts.push(String(int(10 ** int(8)))); break;
            case 2: parts.push(pick([".", ",", " ", "-", "x", "\n", "#", "€", "1.", ",5"])); break;
            case 3: parts.push(Array.from({ length: 14 + int(6) }, () => int(10)).join("")); break;
            case 4: parts.push(pick(["my card", "id", "₺", "v1.2", "total"])); break;
            default: parts.push(Array.from({ length: int(25) }, () => pick(["1", "2", "4", " ", "-", ".", ","])).join(""));
        }
        if (rand() < 0.6) parts.push(pick([" ", "", "\n", ": "]));
    }
    return parts.join("");
}

describe("card numbers, as on Endcord PC", () => {
    test("the cases the first port read differently", () => {
        for (const text of ["12 4111 1111 1111 1111", "1.2 4111 1111 1111 1111", "v1.2 4111111111111111"]) {
            expect(pcCard(text)).toBe(true);
            expect(hasCardNumber(text)).toBe(true);
        }
        // PC reads "5 3782..." as one sixteen-digit number that isn't a card, and so does mobile
        expect(pcCard("5 378282246310005")).toBe(false);
        expect(hasCardNumber("5 378282246310005")).toBe(false);
    });

    test("known numbers", () => {
        expect(hasCardNumber("4111 1111 1111 1111")).toBe(true);
        expect(hasCardNumber("4111-1111-1111-1111")).toBe(true);
        expect(hasCardNumber("378282246310005")).toBe(true);
        // A Discord id, a decimal, a longer number, a bad check digit
        expect(hasCardNumber("123456789012345678")).toBe(false);
        expect(hasCardNumber("3.4111111111111111")).toBe(false);
        expect(hasCardNumber("41111111111111111")).toBe(false);
        expect(hasCardNumber("4111 1111 1111 1112")).toBe(false);
        expect(hasCardNumber("")).toBe(false);
    });

    test("200,000 random texts read the same", () => {
        let positives = 0;
        for (let i = 0; i < 200_000; i++) {
            const text = cardText();
            const pc = pcCard(text);
            if (pc) positives++;
            if (hasCardNumber(text) !== pc) throw new Error(`differs from PC for ${JSON.stringify(text)}: PC ${pc}`);
        }
        console.log(`  ${positives} of them have a card number`);
        expect(positives).toBeGreaterThan(20_000);
    });
});

describe("passwords, as on Endcord PC", () => {
    const before = ["", " ", "my", "a ", "\n", ".", "_", "1", "-", "é", "ş", "ж", "Ж", "x:", "(", "\u00bf", "\u0250"];
    const words = ["password", "PassWord", "passwd", "pwd", "PWD", "şifre", "Şifre", "ŞİFRE", "parola", "contraseña", "CONTRASEÑA", "mot de passe", "пароль", "ПАРОЛЬ", "passw0rd"];
    const seps = [":", "=", " : ", "  =", " ", "", ":\n", "=\t"];
    const values = ["hunter2", "abc", "abcd", " x y", "12345", "", "a b c d", "şşşş", "\n1234"];

    test("every combination reads the same", () => {
        let positives = 0, total = 0;
        for (const b of before) for (const w of words) for (const s of seps) for (const v of values) for (const after of ["", " ok", "\nnext"]) {
            const text = `${b}${w}${s}${v}${after}`;
            const pc = pcPassword(text);
            const mine = findSecret(text, { cards: false }) === "a password";
            if (mine !== pc) throw new Error(`differs from PC for ${JSON.stringify(text)}: PC ${pc}`);
            positives += +pc;
            total++;
        }
        console.log(`  ${total} texts, ${positives} with a password`);
        expect(positives).toBeGreaterThan(1000);
    });

    test("the settings turn each check off", () => {
        expect(findSecret("password: hunter2", { passwords: false })).toBeUndefined();
        expect(findSecret("4111 1111 1111 1111", { cards: false })).toBeUndefined();
        expect(findSecret("4111 1111 1111 1111")).toBe("a card number");
        expect(findSecret("password: hunter2")).toBe("a password");
        expect(findSecret("mypassword: hunter2")).toBeUndefined();
    });
});

describe("tokens and keys", () => {
    test("each kind", () => {
        // Made up, and put together here so a secret scanner doesn't take the file for one
        expect(findSecret(["MTIzNDU2Nzg5MDEyMzQ1Njc4", "GaBcDe", "abcdefghijklmnopqrstuvwxyz01234"].join("."))).toBe("a Discord token");
        expect(findSecret("mfa." + "a".repeat(84))).toBe("a Discord token");
        expect(findSecret("https://discord.com/api/webhooks/123456789012345678/" + "x".repeat(68))).toBe("a webhook link");
        expect(findSecret("-----BEGIN OPENSSH PRIVATE KEY-----")).toBe("a private key");
        expect(findSecret("ghp_" + "a".repeat(36))).toBe("a GitHub token");
        expect(findSecret("sk-ant-" + "a".repeat(40))).toBe("an API key");
        expect(findSecret("AKIA" + "A".repeat(16))).toBe("an API key");
        expect(findSecret(["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"].join("."))).toBe("a login token");
        expect(findSecret("hello there, my id is 123456789012345678")).toBeUndefined();
        expect(findSecret("https://discord.com/channels/1/2")).toBeUndefined();
    });
});
