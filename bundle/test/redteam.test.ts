// What the attacker-style review got past, each now stopped
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";
mock.module(SRC + "core/i18n/index.ts", () => ({ t: (s: string) => s, tx: (s: string) => s }));
mock.module(SRC + "core/vendetta/alerts.ts", () => ({ showConfirmationAlert: () => { } }));
const { checkMessage } = await import(SRC + "plugins/suspiciousLinks/detect.ts");
const { scanPluginCode, isSerious } = await import(SRC + "core/pluginScan.ts");
const kinds = (text: string) => checkMessage(text).map((w: any) => w.kind);

describe("links", () => {
    test("any number of good links in front doesn't hide a bad one", () => {
        const good = Array.from({ length: 60 }, (_, i) => `https://site${i}.example/page`).join(" ");
        expect(kinds(`${good} https://discord-nitro.com`)).toEqual(["bait"]);
        expect(kinds(`${good} https://discord.com@evil.example/login`)).toEqual(["userinfo"]);
    });

    test("a message full of links is still checked quickly", () => {
        const many = Array.from({ length: 400 }, (_, i) => `https://a${i}.io`).join(" ").slice(0, 4000);
        const started = performance.now();
        checkMessage(many);
        expect(performance.now() - started).toBeLessThan(250);
    });

    test("accents and dots don't hide a look-alike", () => {
        for (const link of ["https://ste\u1ea1m.com", "https://disc\u00f6rd.com/nitro", "https://p\u00e0ypal.com", "https://st\u00e9am.com"]) {
            const found = checkMessage(link);
            expect(found.length).toBe(1);
            expect(found[0].host).toBe(new URL(link).hostname);
        }
        // A real name with an accent, which is no brand's look-alike
        expect(checkMessage("https://m\u00fcnchen.de https://caf\u00e9.example https://\u043f\u0440\u0438\u043c\u0435\u0440.\u0440\u0444")).toEqual([]);
    });

    test("Latin with Armenian or Cherokee letters is a mix of alphabets", () => {
        expect(kinds("https://exa\u0574ple-shop.com")).toEqual(["alphabets"]);
        expect(kinds("https://\u13a0bc-store.com")).toEqual(["alphabets"]);
        // Kanji next to Latin is how plenty of real names are written
        expect(kinds("https://example\u65e5\u672c.jp")).toEqual([]);
    });
});

describe("the code scan", () => {
    test("Function reached through a constructor", () => {
        for (const code of ['[]["constructor"]["constructor"]("return 1")()', "({}).constructor.constructor(x)()", "a.constructor['constructor'](y)", 'x["constructor"].constructor(z)']) {
            expect(scanPluginCode(code).map((f: any) => f.kind)).toEqual(["dynamicCode"]);
        }
        expect(scanPluginCode("class A { constructor() { super(); } } new A().constructor.name")).toEqual([]);
    });

    test("native modules reached directly", () => {
        const found = scanPluginCode('const fs = nativeModuleProxy["DCDFile" + "Manager"]; fs.writeFile("documents", p, d)');
        expect(found.map((f: any) => f.kind)).toEqual(["native"]);
        expect(isSerious(found)).toBe(true);
        expect(scanPluginCode("globalThis.__turboModuleProxy('X')").map((f: any) => f.kind)).toEqual(["native"]);
    });
});
