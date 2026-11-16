// Plugins that read other people's messages, made to take as long as the message and no longer: UnitConverter,
// UrlHighlighter and AutoReact. Each new matcher is checked against the one it replaced, which was right but slow
import { describe, expect, jest, mock, test } from "bun:test";

import { SRC } from "./src";

mock.module(SRC + "core/i18n/index.ts", () => ({ t: (s: string) => s, tx: (s: string) => s }));
mock.module(SRC + "plugins/api.ts", () => ({ definePlugin: (definition: any) => definition }));
mock.module(SRC + "plugins/ui/dialogs.tsx", () => ({ choose: () => { }, showText: () => { } }));
mock.module(SRC + "metro/common/index.ts", () => ({ FluxDispatcher: {} }));
let onMessage: (event: any) => void = () => { };
const reactions: string[] = [];
mock.module(SRC + "plugins/common.tsx", () => ({
    currentUserId: () => "1",
    getStore: () => undefined,
    subscribe: (_type: string, handler: (event: any) => void) => {
        onMessage = handler;
        return () => { };
    },
}));
mock.module(SRC + "plugins/hooks.tsx", () => ({
    parseEmoji: (text: string) => text.trim() || null,
    react: (_channel: string, message: string, emoji: string) => void reactions.push(`${message}:${emoji}`),
    nativeColor: () => 1,
    getChannel: () => undefined,
    getGuild: () => undefined,
    onMessageRow: () => () => { },
    addMessageAction: () => () => { },
}));

const { convertUnits } = await import(SRC + "plugins/shared/actions.ts");
const { globMatches } = await import(SRC + "plugins/urlHighlighter/index.ts");
const autoReact = (await import(SRC + "plugins/autoReact/index.ts")).default;

let seed = 3;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

/** UnitConverter before: right, and as slow as a long number squared */
const OLD_UNITS: Array<[RegExp, (n: number) => string]> = [
    [/(-?\d+(?:[.,]\d+)?)\s*(?:km\/h|kph)\b/gi, n => `${r(n * 0.621371)} mph`],
    [/(-?\d+(?:[.,]\d+)?)\s*mph\b/gi, n => `${r(n * 1.609344)} km/h`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:km|kilometers?|kilometres?)\b/gi, n => `${r(n * 0.621371)} mi`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:mi|miles?)\b/gi, n => `${r(n * 1.609344)} km`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:cm|centimeters?|centimetres?)\b/gi, n => `${r(n / 2.54)} in`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:in|inch(?:es)?|")(?=\s|$|[.,!?])/gi, n => `${r(n * 2.54)} cm`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:m|meters?|metres?)\b/gi, n => `${r(n * 3.28084)} ft`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:ft|feet|foot|')(?=\s|$|[.,!?])/gi, n => `${r(n * 0.3048)} m`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:kg|kilograms?|kilos?)\b/gi, n => `${r(n * 2.20462)} lb`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:lbs?|pounds?)\b/gi, n => `${r(n * 0.453592)} kg`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:g|grams?)\b/gi, n => `${r(n / 28.3495)} oz`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:oz|ounces?)\b/gi, n => `${r(n * 28.3495)} g`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:°\s*C|celsius)\b/gi, n => `${r(n * 9 / 5 + 32)} °F`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:°\s*F|fahrenheit)\b/gi, n => `${r((n - 32) * 5 / 9)} °C`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:l|liters?|litres?)\b/gi, n => `${r(n * 0.264172)} gal`],
    [/(-?\d+(?:[.,]\d+)?)\s*(?:gal|gallons?)\b/gi, n => `${r(n * 3.78541)} L`],
];
const r = (n: number) => Math.round(n * 100) / 100;
function oldConvert(text: string): string[] {
    const found: Array<{ index: number; line: string; }> = [];
    const taken: Array<[number, number]> = [];
    for (const [re, convert] of OLD_UNITS) {
        for (const match of text.matchAll(re)) {
            const start = match.index ?? 0, end = start + match[0].length;
            if (taken.some(([s, e]) => start < e && end > s)) continue;
            taken.push([start, end]);
            found.push({ index: start, line: `${match[0].trim()} ≈ ${convert(Number(match[1].replace(",", ".")))}` });
        }
    }
    return found.sort((a, b) => a.index - b.index).map(f => f.line);
}

const oldGlob = (glob: string, text: string) =>
    new RegExp(glob.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, "."), "i").test(text);

describe("UnitConverter", () => {
    test("converts as before", () => {
        expect(convertUnits("I drove 100 km/h for 5 km, then walked 2 miles; it's 30 °C, I'm 6' and 70kg"))
            .toEqual(["100 km/h ≈ 62.14 mph", "5 km ≈ 3.11 mi", "2 miles ≈ 3.22 km", "30 °C ≈ 86 °F", "6' ≈ 1.83 m", "70kg ≈ 154.32 lb"]);
        expect(convertUnits("no units here 42")).toEqual([]);
    });

    test("finds exactly what the old matcher found, on thousands of messages", () => {
        const words = ["5", "-3", "2.5", "1,5", "12", " ", "1.2.3", "-", "--4", "7,", ".5", "3.", "0", "  ", "km", "km/h", "kph", "mph", "mi", "miles", "cm", "in", "inch", "\"", "m", "metres", "ft", "'", "feet",
            "kg", "kilos", "lb", "lbs", "g", "grams", "oz", "°C", "° F", "celsius", "l", "litres", "gal", ".", ",", "!", "x", "km2", "1.2.3", "\n"];
        for (let n = 0; n < 3000; n++) {
            const text = Array.from({ length: 1 + Math.floor(rand() * 12) }, () => pick(words)).join(rand() < 0.5 ? "" : " ");
            expect(convertUnits(text)).toEqual(oldConvert(text));
        }
    });

    test("a long run of digits doesn't hold the menu up", () => {
        for (const text of ["9".repeat(4000), `${"1".repeat(3995)} km`, `${"12 ".repeat(1300)}x`, `${"-".repeat(2000)}${"5".repeat(2000)}`]) {
            const started = performance.now();
            convertUnits(text);
            expect(performance.now() - started).toBeLessThan(50);
        }
    });
});

describe("UrlHighlighter", () => {
    test("matches what the old patterns matched", () => {
        const letters = "abc.:/*?-_*";
        for (let n = 0; n < 5000; n++) {
            const glob = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => pick([..."abc.*?/"])).join("");
            const url = `https://${Array.from({ length: Math.floor(rand() * 20) }, () => pick([...letters])).join("")}`;
            expect(globMatches(glob.toLowerCase(), url.toLowerCase())).toBe(oldGlob(glob, url));
        }
        expect(globMatches("*github.com*", "https://github.com/endcord")).toBe(true);
        expect(globMatches("*.example.org/*", "https://cdn.example.org/a")).toBe(true);
        expect(globMatches("github.com", "https://gitlab.com")).toBe(false);
    });

    test("a long link that doesn't match takes no time", () => {
        const url = `https://${"a".repeat(2040)}`;
        const started = performance.now();
        for (const glob of ["*github.com*", "*a*a*a*a*b*", "?".repeat(40)]) globMatches(glob, url);
        expect(performance.now() - started).toBeLessThan(50);
    });
});

describe("AutoReact", () => {
    test("a flood of matching messages becomes a few reactions, not one for each", () => {
        jest.useFakeTimers();
        const store = { rules: "gg = 🎉\nwin = 🏆\nlol = 😂\nok = 👍", reactToSelf: false, channels: "" };
        const cleanups: Array<() => void> = [];
        autoReact.start!({ store, cleanup: (...fns: Array<() => void>) => void cleanups.push(...fns) } as any);
        for (let i = 0; i < 1000; i++) onMessage({ message: { id: `m${i}`, channel_id: "c", content: "gg win lol ok", author: { id: "2" } } });
        jest.advanceTimersByTime(60_000);
        expect(reactions.length).toBe(20);
        // At most three for one message, however many rules match it
        expect(reactions.filter(x => x.startsWith("m0:")).length).toBe(3);
        cleanups.forEach(fn => fn());
        jest.useRealTimers();
    });
});
