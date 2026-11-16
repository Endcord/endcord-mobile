// The selected theme at start: applied again only when it changed. Applying it redraws every screen, so doing it when the
// colors Discord started with are the theme's already costs every start a second drawing for nothing
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";

mock.module(SRC + "core/i18n/index.ts", () => ({ t: (s: string) => s, tx: (s: string) => s }));
mock.module(SRC + "lib/addons/themes/builtin/endcord-wallpaper.png", () => ({ default: "data:image/png;base64,AAAA" }));

const written: unknown[] = [];
mock.module(SRC + "core/vendetta/storage.ts", () => ({
    awaitStorage: async () => { },
    createFileBackend: () => ({ get: async () => ({}), set: async (value: unknown) => void written.push(value) }),
    createMMKVBackend: () => ({}),
    createStorage: () => ({}),
    wrapSync: (value: unknown) => value,
}));
let stored: any = null;
mock.module(SRC + "lib/api/native/loader.ts", () => ({
    getStoredTheme: () => stored,
    getThemeFilePath: () => "current-theme.json",
    isPyonLoader: () => false,
    isThemeSupported: () => true,
}));
mock.module(SRC + "lib/api/native/fs.ts", () => ({ writeFile: async () => { } }));
mock.module(SRC + "lib/api/storage/index.ts", () => ({ awaitStorage: async () => { } }));
const recolored: unknown[] = [];
mock.module(SRC + "lib/addons/themes/colors/updater.ts", () => ({ updateBunnyColor: (data: unknown) => void recolored.push(data) }));
mock.module(SRC + "lib/addons/themes/colors/index.ts", () => ({ default: () => { } }));
mock.module(SRC + "lib/addons/themes/colors/preferences.ts", () => ({ colorsPref: {} }));
// The built-in themes' colors are hex already: the parser hands them back as they are
mock.module(SRC + "lib/addons/themes/colors/parser.ts", () => ({ normalizeToHex: (color: string) => color, applyAndroidAlphaKeys: () => { } }));
mock.module("react-native", () => ({ Platform: { OS: "ios" } }));

const themesModule = await import(SRC + "lib/addons/themes/index.ts");
const ID = "endcord:theme/endcord";
const { builtinTheme } = await import(SRC + "lib/addons/themes/builtin/index.ts");

/** The keys of every object in reverse order, as a dictionary on iOS may hand them back */
const reversed = (value: unknown): unknown => Array.isArray(value) ? value.map(reversed)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).reverse().map(k => [k, reversed((value as any)[k])])) : value;

beforeEach(() => {
    written.length = 0;
    recolored.length = 0;
});

describe("the selected theme at start", () => {
    test("isn't applied again when Discord started with it", async () => {
        stored = { id: ID, selected: true, data: builtinTheme(ID) };
        await themesModule.fetchTheme(ID, true);
        expect(written).toEqual([]);
        expect(recolored).toEqual([]);
    });

    test("...whatever order the loader hands its keys back in", async () => {
        stored = reversed({ id: ID, selected: true, data: builtinTheme(ID) });
        expect(Object.keys(stored.data)[0]).not.toBe(Object.keys(builtinTheme(ID)!)[0]);
        await themesModule.fetchTheme(ID, true);
        expect(written).toEqual([]);
    });

    test("is applied when its colors or its background changed, or the loader left the background out", async () => {
        for (const change of [
            (data: any) => void (data.rawColors.NEUTRAL_86 = "#000000"),
            (data: any) => void (data.semanticColors.TEXT_LINK = ["#000000", "#000000"]),
            (data: any) => void (data.background = { ...data.background, alpha: 0.5 }),
            (data: any) => void delete data.background,
        ]) {
            const data = builtinTheme(ID)!;
            change(data);
            stored = { id: ID, selected: true, data };
            written.length = 0;
            await themesModule.fetchTheme(ID, true);
            expect(written.length).toBe(1);
        }
    });

    test("a spec 3 theme is compared by its colors too", async () => {
        stored = { id: ID, selected: true, data: { ...builtinTheme(ID), main: { type: "dark", raw: { X: "#000000" } } } };
        await themesModule.fetchTheme(ID, true);
        expect(written.length).toBe(1);
    });

    test("another theme, or none, is applied", async () => {
        for (const theme of [{ id: "endcord:theme/ocean", selected: true, data: builtinTheme("endcord:theme/ocean") }, null]) {
            stored = theme;
            written.length = 0;
            await themesModule.fetchTheme(ID, true);
            expect(written.length).toBe(1);
        }
    });

    test("a theme that isn't selected is never applied", async () => {
        stored = null;
        await themesModule.fetchTheme(ID, false);
        expect(written).toEqual([]);
        expect(recolored).toEqual([]);
    });
});
