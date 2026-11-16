// Endcord's built-in themes: every color one, the grays in order, and text readable on what it's drawn on, in dark and
// in light (WCAG: 4.5 for text, 3 for icons and large text)
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";

mock.module(SRC + "core/i18n/index.ts", () => ({ t: (s: string) => s, tx: (s: string) => s }));
mock.module(SRC + "lib/addons/themes/builtin/endcord-wallpaper.png", () => ({ default: "data:image/png;base64,AAAA" }));

const builtin = await import(SRC + "lib/addons/themes/builtin/index.ts");
const { contrast, toOklab } = await import(SRC + "lib/addons/themes/builtin/palette.ts");

// Which raw color Discord 353 draws each of these from, in its darker (dark) and light themes
const DARK = { text: 4, strong: 1, muted: 29, icon: 23, channelIcon: 35, chat: 86, card: 79, lowest: 92, floating: 73, brandText: "BLURPLE_36", brandControl: "BRAND_360" };
const LIGHT = { text: 72, strong: 76, muted: 41, icon: 47, channelIcon: 43, chat: 2, card: 1, lowest: 4, floating: 1, brandText: "BLURPLE_53", brandControl: "BRAND_500" };

const themes = builtin.builtinThemes().map(({ id }: { id: string; }) => builtin.builtinTheme(id)!);

describe("each built-in theme", () => {
    test("there are the Endcord theme and Theme Studio's presets, each with an ID that isn't a link", () => {
        const ids = builtin.builtinThemes().map((t: any) => t.id);
        expect(ids).toContain("endcord:theme/endcord");
        expect(ids.length).toBe(9);
        for (const id of ids) {
            expect(builtin.isBuiltinTheme(id)).toBe(true);
            expect(/^https?:/.test(id)).toBe(false);
        }
        expect(builtin.isBuiltinTheme("endcord:theme/nope")).toBe(false);
        expect(builtin.isBuiltinTheme("https://example.com/theme.json")).toBe(false);
        expect(builtin.builtinTheme("endcord:theme/__proto__")).toBeNull();
    });

    test("is a spec 2 theme of colors only, made the same every time", () => {
        for (const theme of themes) {
            expect(theme.spec).toBe(2);
            expect(Object.keys(theme.rawColors!).length).toBe(100 + 27 + 26 + 100);
            for (const value of Object.values(theme.rawColors!)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
            for (const values of Object.values(theme.semanticColors!)) for (const value of values) expect(value).toMatch(/^#[0-9a-f]{6}$/);
            expect(builtin.builtinTheme(builtin.builtinThemes().find((t: any) => t.name === theme.name)!.id)).toEqual(theme);
        }
    });

    test("steps its grays from light to dark", () => {
        for (const theme of themes) {
            let last = Infinity;
            for (let step = 1; step <= 100; step++) {
                const L = toOklab(theme.rawColors![`NEUTRAL_${step}`]).L;
                expect(L).toBeLessThanOrEqual(last + 1e-9);
                last = L;
            }
        }
    });

    for (const [mode, at] of [["dark", DARK], ["light", LIGHT]] as const) {
        test(`reads well in ${mode}`, () => {
            for (const theme of themes) {
                const raw = theme.rawColors!;
                const gray = (step: number) => raw[`NEUTRAL_${step}`];
                const semantic = (key: string, fallback: string) => theme.semanticColors![key]?.[mode === "dark" ? 0 : 1] || fallback;
                const check = (what: string, fg: string, bg: string, min: number) => {
                    const ratio = contrast(fg, bg);
                    if (ratio < min) throw new Error(`${theme.name} ${mode}: ${what} ${fg} on ${bg} is ${ratio.toFixed(2)}, under ${min}`);
                };
                for (const bg of [at.chat, at.card, at.lowest, at.floating]) {
                    check("text", gray(at.text), gray(bg), 7);
                    check("strong text", gray(at.strong), gray(bg), 7);
                    check("muted text", gray(at.muted), gray(bg), 4.5);
                    check("icons", gray(at.icon), gray(bg), 3);
                }
                check("channel icons", gray(at.channelIcon), gray(at.chat), 3);
                for (const bg of [at.chat, at.card, at.lowest, at.floating]) {
                    check("links", semantic("TEXT_LINK", ""), gray(bg), 4.5);
                    check("brand text", semantic("TEXT_BRAND", raw[at.brandText]), gray(bg), 4.5);
                    check("brand icons", semantic("ICON_BRAND", raw[at.brandText]), gray(bg), 4.5);
                    check("brand controls", semantic("CONTROL_BRAND_FOREGROUND", raw[at.brandControl]), gray(bg), 3);
                }
                check("text on the accent", semantic("CONTROL_PRIMARY_TEXT_DEFAULT", gray(1)), raw.BLURPLE_50, 4.5);
            }
        });
    }

    test("only the Endcord theme has the panda wallpaper", () => {
        expect(themes.filter((t: any) => t.background).map((t: any) => t.name)).toEqual(["Endcord"]);
        const endcord = themes.find((t: any) => t.name === "Endcord")!;
        // Endcord's own palette, exactly: night for the chat, panel for cards, paper for text
        expect(endcord.rawColors!.NEUTRAL_86).toBe("#10182a");
        expect(endcord.rawColors!.NEUTRAL_79).toBe("#162137");
        expect(endcord.rawColors!.NEUTRAL_1).toBe("#f3f6fb");
        expect(endcord.rawColors!.BRAND_500).toBe("#3d74e0");
        expect(endcord.rawColors!.BRAND_360).toBe("#9ccbff");
    });
});
