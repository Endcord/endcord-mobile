/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The themes that come with Endcord: its own, in the colors of the logo with the sleeping panda in the chat, and the
 * presets of Endcord PC's Theme Studio. Each is an accent and a background, from which Discord's color scales are made
 * again, as Theme Studio does: its grays (NEUTRAL_*, and PRIMARY_* that older screens use) step from the background to a
 * white of the same hue, and its brand colors (BRAND_*, BLURPLE_*) from the accent. Every screen then takes the theme's
 * colors, including the ones a theme that names a few colors would miss, in dark and in light.
 *
 * They're made from this code, not downloaded: nothing to fetch, and the ones picked are made again on each start, so
 * a fix here reaches everyone who uses them.
 */

import { tx } from "@core/i18n";

import type { VendettaThemeManifest } from "../colors/types";
import wallpaper from "./endcord-wallpaper.png";
import { contrast, mix, ramp, readable, shift } from "./palette";

/** A built-in theme's ID: never a link, so it can't be mistaken for a theme to download */
export const BUILTIN_THEME_PREFIX = "endcord:theme/";

interface Preset {
    key: string;
    name: string;
    description: string;
    accent: string;
    background: string;
    /** The accent's light shade, for links and highlights on a dark background */
    light?: string;
    /** Exact colors for some of the gray steps, over the ones worked out from the background */
    grays?: Array<[number, string]>;
    wallpaper?: boolean;
}

// The Endcord palette (Endcord PC's endcordUi.css): night, panel, panel-hi, line, line-strong, dim, mist, paper
const ENDCORD_GRAYS: Array<[number, string]> = [
    [1, "#f3f6fb"], [2, "#eff3f9"], [5, "#e6ebf3"], [8, "#dce2ec"], [15, "#c3ccdc"], [23, "#a6b2c8"], [29, "#8d9bb5"],
    [35, "#71809b"], [43, "#55637f"], [55, "#33456a"], [64, "#253452"], [71, "#213050"], [73, "#1d2b46"], [76, "#1a2640"],
    [79, "#162137"], [82, "#131c31"], [86, "#10182a"], [92, "#0b1120"], [100, "#03060d"],
];

const PRESETS: Preset[] = [
    {
        key: "endcord",
        name: "Endcord",
        description: tx("Endcord's own colors: night blue and ice, with the sleeping panda from the logo in the chat."),
        accent: "#3d74e0",
        light: "#9ccbff",
        background: "#10182a",
        grays: ENDCORD_GRAYS,
        wallpaper: true,
    },
    { key: "midnight", name: "Midnight", description: tx("Deep blue with a soft periwinkle accent."), accent: "#7aa2ff", background: "#0d1424" },
    { key: "ocean", name: "Ocean", description: tx("Dark teal with sky blue."), accent: "#4fc3f7", background: "#0b1a24" },
    { key: "forest", name: "Forest", description: tx("Deep green with bamboo green."), accent: "#74d49a", background: "#102018" },
    { key: "soft", name: "Soft", description: tx("Muted plum with lavender."), accent: "#c4a7e7", background: "#232136" },
    { key: "rose", name: "Rose", description: tx("Dark with rose pink."), accent: "#f38ba8", background: "#1e1e2e" },
    { key: "sunset", name: "Sunset", description: tx("Dark plum with warm orange."), accent: "#ff8a5c", background: "#1f1418" },
    { key: "neon", name: "Neon", description: tx("Dark violet with hot pink."), accent: "#ff3d9a", background: "#140b1f" },
    { key: "mono", name: "Mono", description: tx("Black and white, without color."), accent: "#d8d8d8", background: "#121212" },
];

const NEUTRAL_STEPS = Array.from({ length: 100 }, (_, i) => i + 1);
const BRAND_STEPS = [100, 130, 160, 200, 230, 260, 300, 330, 345, 360, 400, 430, 460, 500, 530, 560, 600, 630, 660, 700, 730, 760, 800, 830, 860, 900];
/** Discord's older grays, each as the gray step of the same lightness */
const PRIMARY_AS_NEUTRAL: Record<number, number> = {
    100: 3, 130: 4, 160: 6, 200: 8, 230: 10, 260: 12, 300: 15, 330: 19, 345: 24, 360: 28, 400: 34, 430: 41, 460: 46, 500: 50,
    530: 58, 560: 64, 600: 69, 630: 73, 645: 75, 660: 79, 700: 83, 730: 86, 760: 89, 800: 92, 830: 95, 860: 98, 900: 99,
};

/**
 * The gray steps of a background. In Discord's dark theme the chat is step 86, cards 79, the floating bars 73, muted
 * text 29 and text 1 to 5; its light theme reads the same scale from the other end
 */
function grayAnchors(preset: Preset): Array<[number, string]> {
    const bg = preset.background;
    // A white of the background's hue, so text sits in the theme rather than on top of it
    const paper = shift(mix(bg, "#ffffff", 0.94), 0, 0.6);
    const worked: Array<[number, string]> = [
        [1, paper], [2, mix(bg, paper, 0.98)], [5, mix(bg, paper, 0.93)], [8, mix(bg, paper, 0.88)], [15, mix(bg, paper, 0.79)],
        [23, mix(bg, paper, 0.68)], [29, mix(bg, paper, 0.62)], [35, mix(bg, paper, 0.47)], [43, mix(bg, paper, 0.3)],
        [55, shift(bg, 0.19)], [64, shift(bg, 0.11)], [71, shift(bg, 0.075)], [73, shift(bg, 0.064)], [76, shift(bg, 0.05)],
        [79, shift(bg, 0.035)], [82, shift(bg, 0.017)], [86, bg], [92, shift(bg, -0.035)], [100, shift(bg, -0.2, 0.5)],
    ];
    if (!preset.grays) return worked;
    const exact = new Map(preset.grays);
    return worked.map(([step, color]) => [step, exact.get(step) ?? color]);
}

/** A built-in theme, made anew each time */
function makeTheme(preset: Preset): VendettaThemeManifest {
    const { accent } = preset;
    const light = preset.light ?? mix(accent, "#ffffff", 0.42);
    const rawColors: Record<string, string> = {};

    const grays = ramp(grayAnchors(preset), NEUTRAL_STEPS);
    for (const step of NEUTRAL_STEPS) rawColors[`NEUTRAL_${step}`] = grays[step];
    for (const [primary, neutral] of Object.entries(PRIMARY_AS_NEUTRAL)) rawColors[`PRIMARY_${primary}`] = grays[neutral];

    const brand = ramp([
        [100, mix(accent, "#ffffff", 0.93)], [200, mix(accent, "#ffffff", 0.8)], [300, mix(light, "#ffffff", 0.35)], [360, light],
        [500, accent], [600, shift(accent, -0.08)], [700, shift(accent, -0.2)], [800, shift(accent, -0.3, 0.8)],
        [900, shift(accent, -0.45, 0.5)],
    ], BRAND_STEPS);
    for (const step of BRAND_STEPS) rawColors[`BRAND_${step}`] = brand[step];

    // Discord's newer brand scale: 36 is brand text on dark, 50 the brand background, 53 brand text on light
    const blurple = ramp([
        [1, mix(light, "#ffffff", 0.8)], [10, mix(light, "#ffffff", 0.5)], [26, light], [50, accent], [53, shift(accent, -0.025)],
        [75, shift(accent, -0.25, 0.8)], [99, shift(accent, -0.6, 0.3)], [100, "#000000"],
    ], NEUTRAL_STEPS);
    for (const step of NEUTRAL_STEPS) rawColors[`BLURPLE_${step}`] = blurple[step];

    // Text on the accent (buttons): Discord's is white, unreadable on a light accent like Mono's or Forest's
    const dark = shift(preset.background, -0.1);
    const onAccent = contrast(grays[1], accent) >= contrast(dark, accent) ? grays[1] : dark;
    // The accent as text and icons, readable on every background it's drawn on: on dark the lightest of those, the
    // floating bars (73); on light the darkest, the server list (4)
    const onDark = (color: string, min = 4.5) => readable(color, grays[73], min);
    const onLight = (color: string, min = 4.5) => readable(color, grays[4], min);
    const brandText = [onDark(blurple[36]), onLight(blurple[53])];
    const brandControl = [onDark(brand[360], 3), onLight(brand[500], 3)];

    const theme: VendettaThemeManifest = {
        spec: 2,
        name: preset.name,
        description: preset.description,
        authors: [{ name: "Endcord", id: "0" }],
        semanticColors: {
            TEXT_LINK: [onDark(light), onLight(shift(accent, -0.12))],
            TEXT_BRAND: brandText,
            ICON_BRAND: brandText,
            CONTROL_BRAND_FOREGROUND: brandControl,
            CONTROL_BRAND_FOREGROUND_NEW: brandControl,
            CONTROL_PRIMARY_TEXT_DEFAULT: [onAccent, onAccent],
        },
        rawColors,
    };
    if (preset.wallpaper) theme.background = { url: wallpaper, blur: 0, alpha: 1 };
    return theme;
}

export const builtinThemeId = (key: string) => `${BUILTIN_THEME_PREFIX}${key}`;

/** Whether an ID is one of Endcord's own themes */
export const isBuiltinTheme = (id: unknown): id is string =>
    typeof id === "string" && id.startsWith(BUILTIN_THEME_PREFIX) && PRESETS.some(p => builtinThemeId(p.key) === id);

/** Endcord's own themes, as theme IDs with their English names and descriptions */
export const builtinThemes = () => PRESETS.map(p => ({ id: builtinThemeId(p.key), name: p.name, description: p.description, accent: p.accent, background: p.background }));

/** A built-in theme's manifest, or null for an ID that isn't one */
export function builtinTheme(id: string): VendettaThemeManifest | null {
    const preset = PRESETS.find(p => builtinThemeId(p.key) === id);
    return preset ? makeTheme(preset) : null;
}
