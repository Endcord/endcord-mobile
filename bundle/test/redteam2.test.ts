// The attacker review's bundle findings, each now closed
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";
mock.module(SRC + "core/i18n/index.ts", () => ({
    t: (s: string, v?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? `{${k}}`)),
    tx: (s: string) => s,
}));
const format = await import(SRC + "plugins/customProfile/sharingFormat.ts");
const data = await import(SRC + "plugins/customProfile/data.ts");
const translate = (s: string, v?: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v?.[k] ?? `{${k}}`);
// A profile message with nothing left in it that may be shown reads as an empty profile ({}), which shows nothing
const read = (profile: unknown) => format.readProfileMessage(`ecp1 ${JSON.stringify(profile)}`);

describe("what a shared profile may carry", () => {
    test("names are stripped of control and direction characters", () => {
        const out = read({ username: "a\u202eb\u0000c\u200b", globalName: "\u2066good", bio: "hi\nthere\u0007", pronouns: "\u0007" });
        expect(out!.username).toBe("abc");
        expect(out!.globalName).toBe("good");
        // A bio keeps its line breaks but nothing else hidden
        expect(out!.bio).toBe("hi\nthere");
        expect(out!.pronouns).toBeUndefined();
        // Nothing left after stripping isn't kept
        expect(read({ username: "\u0000\u202e" })).toEqual({});
    });

    test("a decoration or palette can't name an object's own property, or hold a dot", () => {
        expect(read({ decorationAsset: "__proto__" })).toEqual({});
        expect(read({ decorationAsset: ".." })).toEqual({});
        expect(read({ decorationAsset: "a.b" })).toEqual({});
        expect(read({ decorationAsset: "1234567890" })!.decorationAsset).toBe("1234567890");
        const plate = (palette: string) => read({ nameplate: { skuId: "1", asset: "nameplates/x/", palette } })?.nameplate?.palette;
        expect(plate("toString")).toBeUndefined();
        expect(plate("cobalt")).toBe("cobalt");
    });

    test("a display name style always keeps a color", () => {
        expect(read({ displayNameStyles: { fontId: 1, effectId: 1, colors: [] } })).toEqual({});
        expect(read({ displayNameStyles: { fontId: 1, effectId: 1, colors: [0x112233] } })!.displayNameStyles!.colors).toEqual([0x112233]);
    });

    test("a picture link isn't absurdly long, and only points at Discord", () => {
        expect(read({ bio: "ok", avatar: `https://cdn.discordapp.com/a/${"x".repeat(2000)}` })!.avatar).toBeUndefined();
        expect(read({ avatar: "https://cdn.discordapp.com/a/b.png" })!.avatar).toBe("https://cdn.discordapp.com/a/b.png");
    });

    test("a tiered badge key can't be an object's own name", () => {
        expect(read({ tieredBadges: { toString: 1, hasOwnProperty: 1 } })).toEqual({});
        expect(read({ tieredBadges: { account_age: 3 } })!.tieredBadges).toEqual({ account_age: 3 });
    });

    test("what writeProfileMessage sends is only what a reader would keep", () => {
        // A profile with a nameplate Discord can't read and a bad decoration, as a restored backup might hold
        const written = format.writeProfileMessage({ bio: "ok", decorationAsset: "..", displayNameStyles: { fontId: 1, effectId: 1, colors: [] } } as any);
        const back = JSON.parse(written.content.slice("ecp1 ".length));
        expect(back.decorationAsset).toBeUndefined();
        expect(back.displayNameStyles).toBeUndefined();
        expect(back.bio).toBe("ok");
    });
});

describe("badges", () => {
    test("a flag named twice is drawn once, with one key", () => {
        const out = read({ badgeFlags: 1, customBadgeIds: [...Array(10).fill("quest"), ...Array(10).fill("1")] })!;
        const keys = data.buildBadges(out, translate).map(b => b.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
