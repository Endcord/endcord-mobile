// SuspiciousLinks on mobile reads a link's host itself; Endcord PC takes new URL(raw).hostname. Bun's URL is the
// reference here
import { describe, expect, test } from "bun:test";

import { SRC } from "./src";
const { checkMessage, decodePunycode, encodePunycode, linkParts } = await import(SRC + "plugins/suspiciousLinks/detect.ts");

let seed = 11;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const int = (n: number) => Math.floor(rand() * n);
const pick = <T,>(list: T[]) => list[int(list.length)];

/** What PC reads: the hostname, and whether there's a user name or password; null when URL throws */
function reference(raw: string) {
    try {
        const url = new URL(raw);
        return { host: url.hostname.toLowerCase(), userinfo: !!(url.username || url.password) };
    } catch {
        return null;
    }
}
const isIp = (host: string) => host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host);

describe("punycode", () => {
    test("RFC 3492's examples", () => {
        expect(encodePunycode("bücher")).toBe("bcher-kva");
        expect(encodePunycode("münchen")).toBe("mnchen-3ya");
        expect(encodePunycode("ü")).toBe("tda");
        // (A) Arabic (Egyptian), from the RFC
        expect(encodePunycode("\u0644\u064A\u0647\u0645\u0627\u0628\u062A\u0643\u0644\u0645\u0648\u0634\u0639\u0631\u0628\u064A\u061F")).toBe("egbpdaj6bu4bxfgehfvwxn");
        // (L) Japanese, mixed
        expect(encodePunycode("3\u5E74B\u7D44\u91D1\u516B\u5148\u751F")).toBe("3B-ww4c5e180e575a65lsy2b");
    });

    test("decoding gives back what was encoded", () => {
        const letters = [..."abcxyz09-", ..."абвгдеёжзийклмнопрстуфхцчшщъыьэюя", ..."αβγδεζηθικλμνξοπρστυφχψω", "ü", "ş", "ğ", "ı", "é", "ñ", "中", "文", "😀", "\u{1F600}"];
        for (let i = 0; i < 20_000; i++) {
            const text = Array.from({ length: 1 + int(20) }, () => pick(letters)).join("");
            const encoded = encodePunycode(text);
            expect(/^[a-z0-9-]*$/.test(encoded)).toBe(true);
            expect(decodePunycode(encoded)).toBe(text);
        }
    });
});

describe("a link's host, as URL reads it", () => {
    test("ASCII hosts with every awkward character", () => {
        const pieces = [..."abcdefghijklmnopqrstuvwxyzABCDEFXYZ0123456789", ".", ".", "-", "_", "@", "@", ":", ":", "%41", "%2e", "%2E", "%zz", "%", "%40", "%25", "[", "]", "|", "^", "<", "~", "!", "$", "&", "'", "*", "+", ",", ";", "=", "discord", "xn--", "com"];
        const tails = ["", "/", "/x", "?q=1", "#f", "\\x", "/@a"];
        const mismatches: Record<string, string[]> = {};
        let compared = 0, refused = 0;
        for (let i = 0; i < 100_000; i++) {
            const authority = Array.from({ length: 1 + int(14) }, () => pick(pieces)).join("");
            const raw = `https://${authority}${pick(tails)}`;
            const want = reference(raw);
            const got = linkParts(raw);
            let kind: string | null = null;
            if (!want) {
                refused++;
                if (got) kind = isIp(got.host) || /(?:^|\.)(?:\d+|0x[0-9a-f]*)\.?$/i.test(got.host) ? "url-refuses-number-ending" : got.host.split(".").some(l => l.startsWith("xn--")) ? "url-refuses-xn" : "url-refuses";
            } else if (!got) {
                kind = "mine-refuses";
            } else if (!isIp(want.host)) {
                compared++;
                if (got.host !== want.host) kind = "host";
                else if (got.userinfo !== want.userinfo) kind = "userinfo";
            }
            if (kind) (mismatches[kind] ??= []).push(`${raw} -> url ${JSON.stringify(want)} mine ${JSON.stringify(got)}`);
        }
        for (const [kind, list] of Object.entries(mismatches)) console.log(`  ${kind}: ${list.length}, like\n    ${list.slice(0, 4).join("\n    ")}`);
        console.log(`  ${compared} compared, ${refused} refused by URL`);
        // What's left is a browser refusing a name that ends in a number, or a bad xn-- label, that mobile still reads
        expect(Object.keys(mismatches).filter(k => !["url-refuses-number-ending", "url-refuses-xn"].includes(k))).toEqual([]);
    });

    test("hosts outside English", () => {
        const letters = [..."abcdefghijklmnopqrstuvwxyzABCDEF0123456789-", ..."абвгдеёжзийклмнопрстуфхцчшщыэюяАБВГДЕЖЗ", ..."αβγδεζηθικλμνξοπρστυφχψωΑΒΓ", ..."ａｂｃｄＡＢ", "ü", "ş", "ğ", "é", "ñ", "ﬁ", "ⅰ", "。", "．", ".", "."];
        const mismatches: string[] = [];
        let compared = 0;
        for (let i = 0; i < 50_000; i++) {
            const host = Array.from({ length: 1 + int(16) }, () => pick(letters)).join("") + pick([".com", ".net", "", ".рф"]);
            const raw = `https://${host}/path`;
            const want = reference(raw);
            if (!want || isIp(want.host)) continue;
            const got = linkParts(raw);
            compared++;
            if (got?.host !== want.host) mismatches.push(`${host} -> url ${want.host} mine ${got?.host}`);
        }
        console.log(`  ${compared} compared, ${mismatches.length} differ${mismatches.length ? `, like\n    ${mismatches.slice(0, 8).join("\n    ")}` : ""}`);
        expect(mismatches).toEqual([]);
    });
});

describe("what the first review found", () => {
    test("characters a browser leaves out of a name", () => {
        const ignored = ["­", "͏", "᠋", "᠌", "᠍", "᠏", "​", "⁠", "⁤", "︀", "️", "﻿", "\u{1bca0}", "\u{1bca3}", "\u{e0100}", "\u{e01ef}"];
        const mismatches: string[] = [];
        for (const char of ignored) for (const host of [`discord.com${char}.evil.example`, `dis${char}cord-nitro.com`, `${char}steam.com`, `xn--dscord-pvf${char}.com`]) {
            const raw = `https://${host}/`;
            const want = reference(raw);
            const got = linkParts(raw);
            if (want?.host !== got?.host) mismatches.push(`U+${char.codePointAt(0)!.toString(16)} in ${JSON.stringify(host)}: url ${want?.host} mine ${got?.host}`);
        }
        console.log(mismatches.length ? `  ${mismatches.join("\n  ")}` : "  all read as URL does");
        expect(mismatches).toEqual([]);
        expect(checkMessage("https://discord.com­.evil.example").map(w => w.kind)).toEqual(["lookalike"]);
    });

    test("more slashes after the scheme", () => {
        for (const raw of ["https:///discord.com@evil.example/", "https://\\discord.com@evil.example/", "https:////evil.example", "https:\\\\evil.example/x"]) {
            const want = reference(raw);
            expect(linkParts(raw)).toEqual(want);
        }
        expect(checkMessage("https:///discord.com@evil.example/")).toEqual([{ kind: "userinfo", host: "evil.example", shown: "discord.com" }]);
    });

    test("copies of a good link don't use up the limit", () => {
        const text = `${"https://discord.com ".repeat(30)}https://discord-nitro.com`;
        expect(checkMessage(text).map(w => w.kind)).toEqual(["bait"]);
        // A masked link to a site already linked plainly is still checked
        expect(checkMessage("https://evil.example [discord.com](https://evil.example)").map(w => w.kind)).toEqual(["hidden"]);
        expect(checkMessage("https://evil.example https://discord.com@evil.example").map(w => w.kind)).toEqual(["userinfo"]);
    });
});

describe("hosts no name can be", () => {
    test("one longer than any that can be looked up is skipped, without holding up the chat", () => {
        // Thousands of different characters outside English, link after link: each one different, so nothing is cached
        const long = (n: number) => Array.from({ length: 2000 }, (_, i) => String.fromCodePoint(0x4e00 + (i * 7 + n) % 20000)).join("");
        const message = Array.from({ length: 10 }, (_, n) => `https://${long(n)}.com`).join(" ");
        const started = performance.now();
        expect(checkMessage(message)).toEqual([]);
        expect(performance.now() - started).toBeLessThan(200);
        expect(linkParts(`https://${"a".repeat(64)}.com`)).toBeNull();
        expect(linkParts(`https://${"a.".repeat(130)}com`)).toBeNull();
    });

    test("the longest a name can be still reads, and a look-alike in it still warns", () => {
        expect(linkParts(`https://${"a".repeat(63)}.com`)?.host).toBe(`${"a".repeat(63)}.com`);
        expect(checkMessage("https://discord-nitro.com").map(w => w.kind)).toEqual(["bait"]);
    });
});

describe("the warnings", () => {
    const kinds = (text: string) => checkMessage(text).map(w => w.kind);

    test("each kind", () => {
        expect(checkMessage("https://discord.com/channels/1/2")).toEqual([]);
        expect(checkMessage("https://discord.com@evil.example/x")).toEqual([{ kind: "userinfo", host: "evil.example", shown: "discord.com" }]);
        expect(checkMessage("[discord.com](https://evil.example)")).toEqual([{ kind: "hidden", host: "evil.example", shown: "discord.com" }]);
        expect(kinds("https://discord.com.evil.example")).toEqual(["lookalike"]);
        expect(kinds("https://dlscord.com")).toEqual(["lookalike"]);
        expect(kinds("https://discord-nitro.com")).toEqual(["bait"]);
        expect(kinds("https://%64iscord-nitro.com")).toEqual(["bait"]);
        expect(kinds("https://:@discord-nitro.com")).toEqual(["bait"]);
        // A fan site with the real name
        expect(kinds("https://discord.ru")).toEqual([]);
        // A port no link can have: a browser won't open it, and PC skips it
        expect(kinds("https://discord-nitro.com:99999/")).toEqual([]);
    });

    test("other alphabets, shown in the form that gives them away, as on PC", () => {
        // Discord with a Cyrillic і, and Steam written in Cyrillic only
        for (const raw of ["https://d\u0456scord.com/login", "https://\u0455\u0442\u0435\u0430\u043c.com", "https://DISCORD\uff0Ecom-nitro.com"]) {
            const warnings = checkMessage(raw);
            const host = new URL(raw).hostname;
            console.log(`  ${raw} -> ${JSON.stringify(warnings)}`);
            if (warnings.length) expect(warnings[0].host).toBe(host);
        }
        expect(kinds("https://d\u0456scord.com/login")).toEqual(["alphabets"]);
        expect(kinds("https://\u0455\u0442\u0435\u0430\u043c.com")).toEqual(["alphabets"]);
    });
});
