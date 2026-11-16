// CustomProfile hands a shared name style or nameplate to Discord only with values Discord has: these are read from
// Discord's own tables, which newer builds keep as named enums (DisplayNameFont, DisplayNameEffect) and older ones as
// modules of their own. Reading the wrong one left almost every shared name style unshown
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";

/** Discord's modules, by what findByProps is asked for */
let modules: Record<string, unknown> = {};
let throws = false;
const findByProps = (...props: string[]) => {
    if (throws) throw new Error("metro isn't ready");
    return modules[props.join(",")];
};
mock.module(SRC + "metro/index.ts", () => ({ findByProps }));

const { KNOWN_PALETTES, nameEffects, nameFonts, nameplatePalettes } = await import(SRC + "plugins/customProfile/discordTables.ts");

/** A TypeScript enum as it's compiled: each name to its number, and each number back to its name */
function tsEnum(entries: Record<string, number>) {
    const out: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(entries)) {
        out[key] = value;
        out[value] = key;
    }
    return out;
}

beforeEach(() => {
    modules = {};
    throws = false;
});

describe("display name styles", () => {
    test("read from the named enums, without Discord's test and unspecified entries or the reverse mapping", () => {
        modules.DisplayNameFont = { DisplayNameFont: tsEnum({ UNSPECIFIED: 0, DEFAULT: 11, BANGERS: 1, CHERRY_BOMB: 4, TEST_FONT: 99 }) };
        modules.DisplayNameEffect = { DisplayNameEffect: tsEnum({ UNSPECIFIED: 0, SOLID: 1, GRADIENT: 2, NEON: 3, TEST_EFFECT: 98 }) };
        expect(nameFonts()).toEqual([{ id: 11, name: "Default" }, { id: 1, name: "Bangers" }, { id: 4, name: "Cherry Bomb" }]);
        expect(nameEffects().map(option => option.name)).toEqual(["Solid", "Gradient", "Neon"]);
    });

    test("an older Discord's own modules, found by their members", () => {
        modules["CHICLE,DEFAULT"] = { DEFAULT: 11, CHICLE: 5 };
        modules["SOLID,GRADIENT,NEON,GUMMY"] = tsEnum({ SOLID: 1, GRADIENT: 2, NEON: 3, GUMMY: 8 });
        expect(nameFonts().map(option => option.id).sort((a, b) => a - b)).toEqual([5, 11]);
        expect(nameEffects().map(option => option.id)).toEqual([1, 2, 3, 8]);
    });

    test("nothing to offer when Discord has neither, or isn't ready, rather than an error", () => {
        expect(nameFonts()).toEqual([]);
        modules.DisplayNameFont = { DisplayNameFont: "not an enum" };
        expect(nameFonts()).toEqual([]);
        throws = true;
        expect(nameEffects()).toEqual([]);
    });

    test("only whole numbers count: a name mapped to text, an object or NaN isn't a style", () => {
        modules.DisplayNameFont = { DisplayNameFont: { DEFAULT: 11, NAME: "x", NESTED: { a: 1 }, NOT_A_NUMBER: Number.NaN, HALF: 1.5, OK: 3 } };
        expect(nameFonts()).toEqual([{ id: 11, name: "Default" }, { id: 3, name: "Ok" }]);
    });
});

describe("nameplate colors", () => {
    test("Discord's own table, black included", () => {
        modules.NAMEPLATE_PALETTES = { NAMEPLATE_PALETTES: { crimson: {}, black: {}, bubble_gum: {} } };
        expect([...nameplatePalettes()!].sort()).toEqual(["black", "bubble_gum", "crimson"]);
    });

    test("a name that isn't one of Discord's color names is left out of its table", () => {
        modules.NAMEPLATE_PALETTES = { NAMEPLATE_PALETTES: { crimson: {}, "Not A Name": {}, ["x".repeat(41)]: {}, "../a": {} } };
        expect([...nameplatePalettes()!]).toEqual(["crimson"]);
    });

    test("not found while the table is missing, empty or Discord isn't ready, so it's looked for again", () => {
        expect(nameplatePalettes()).toBeNull();
        modules.NAMEPLATE_PALETTES = { NAMEPLATE_PALETTES: {} };
        expect(nameplatePalettes()).toBeNull();
        modules.NAMEPLATE_PALETTES = { NAMEPLATE_PALETTES: { "Not A Name": {} } };
        expect(nameplatePalettes()).toBeNull();
        throws = true;
        expect(nameplatePalettes()).toBeNull();
    });

    test("until then, the colors known when this was written, black included", () => {
        expect([...KNOWN_PALETTES].sort()).toEqual(["berry", "black", "bubble_gum", "clover", "cobalt", "crimson", "forest", "lemon", "sky", "teal", "violet", "white"]);
    });

    test("the names an object has of its own are never a color", () => {
        modules.NAMEPLATE_PALETTES = { NAMEPLATE_PALETTES: Object.create(null, { crimson: { value: {}, enumerable: true } }) };
        const fromDiscord = nameplatePalettes()!;
        for (const palettes of [fromDiscord, KNOWN_PALETTES]) {
            for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty"]) expect(palettes.has(name)).toBe(false);
        }
    });
});
