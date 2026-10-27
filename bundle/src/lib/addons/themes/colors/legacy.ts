/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Themes made for older Discord, on the current one.
 *
 * Most themes in circulation were written against Discord's old color names: semantic colors such as
 * BACKGROUND_PRIMARY and TEXT_NORMAL, and the raw palettes PRIMARY_*, BRAND_*, RED_* and so on. Since its 2025 visual
 * refresh, Discord draws from new semantic names (BACKGROUND_BASE_LOW, TEXT_DEFAULT...) and new raw palettes
 * (NEUTRAL_*, BLURPLE_*, RED_NEW_*...), so an old theme only reached part of the app. This fills the gaps: a new
 * semantic color takes the theme's value for its old name, and a new raw color takes the theme's value for the old
 * raw color that Discord's own palette has closest to it.
 */

import chroma from "chroma-js";

import type { InternalColorDefinition } from "./types";

/** New semantic color → the old names a theme may define it under, in order of preference */
export const LEGACY_SEMANTIC: Record<string, string[]> = {
    BACKGROUND_BASE_LOW: ["BACKGROUND_PRIMARY", "CHAT_BACKGROUND", "BG_BASE_PRIMARY"],
    BACKGROUND_BASE_LOWER: ["BACKGROUND_SECONDARY", "BACKGROUND_MOBILE_PRIMARY", "BG_BASE_SECONDARY"],
    BACKGROUND_BASE_LOWEST: ["BACKGROUND_TERTIARY", "BACKGROUND_MOBILE_SECONDARY", "BG_BASE_TERTIARY"],
    BACKGROUND_SURFACE_HIGH: ["BACKGROUND_FLOATING", "BACKGROUND_SECONDARY_ALT"],
    BACKGROUND_SURFACE_HIGHEST: ["BACKGROUND_NESTED_FLOATING", "BACKGROUND_FLOATING"],
    BG_SURFACE_RAISED: ["BACKGROUND_MOBILE_PRIMARY", "BACKGROUND_SECONDARY"],
    BACKGROUND_MOD_SUBTLE: ["BACKGROUND_MODIFIER_HOVER"],
    BACKGROUND_MOD_NORMAL: ["BACKGROUND_MODIFIER_ACTIVE"],
    BACKGROUND_MOD_STRONG: ["BACKGROUND_MODIFIER_SELECTED"],
    BACKGROUND_MOD_MUTED: ["BACKGROUND_MODIFIER_ACCENT"],
    TEXT_DEFAULT: ["TEXT_NORMAL"],
    TEXT_STRONG: ["HEADER_PRIMARY", "TEXT_NORMAL"],
    TEXT_SUBTLE: ["HEADER_SECONDARY", "TEXT_MUTED"],
    ICON_DEFAULT: ["INTERACTIVE_NORMAL"],
    ICON_STRONG: ["INTERACTIVE_ACTIVE"],
    ICON_MUTED: ["INTERACTIVE_MUTED"],
    ICON_SUBTLE: ["INTERACTIVE_MUTED"],
    INTERACTIVE_TEXT_DEFAULT: ["INTERACTIVE_NORMAL"],
    INTERACTIVE_TEXT_HOVER: ["INTERACTIVE_HOVER"],
    INTERACTIVE_TEXT_ACTIVE: ["INTERACTIVE_ACTIVE"],
    INTERACTIVE_ICON_DEFAULT: ["INTERACTIVE_NORMAL"],
    INTERACTIVE_ICON_HOVER: ["INTERACTIVE_HOVER"],
    INTERACTIVE_ICON_ACTIVE: ["INTERACTIVE_ACTIVE"],
    INPUT_BACKGROUND_DEFAULT: ["INPUT_BACKGROUND"],
    CHAT_INPUT_BACKGROUND: ["REDESIGN_CHAT_INPUT_BACKGROUND", "INPUT_BACKGROUND"],
    MOBILE_CHATINPUT_BACKGROUND_DEFAULT: ["REDESIGN_CHAT_INPUT_BACKGROUND", "INPUT_BACKGROUND"],
    MESSAGE_MENTIONED_BACKGROUND_DEFAULT: ["BACKGROUND_MENTIONED"],
    MESSAGE_MENTIONED_BACKGROUND_HOVER: ["BACKGROUND_MENTIONED_HOVER"],
    MOBILE_ANDROID_BUTTON_BACKGROUND_RIPPLE: ["ANDROID_RIPPLE"],
    CARD_BACKGROUND_DEFAULT: ["CARD_PRIMARY_BG", "BACKGROUND_SECONDARY"],
    CARD_SECONDARY_BACKGROUND_DEFAULT: ["CARD_SECONDARY_BG"],
};

/** New raw palettes → the old palette Discord used for the same role */
const PALETTES: Array<[newPalette: RegExp, oldPalette: RegExp]> = [
    [/^NEUTRAL_\d+$/, /^PRIMARY_\d+$/],
    [/^BLURPLE_\d+$/, /^BRAND_\d+$/],
    [/^BLUE_NEW_\d+$/, /^BLUE_\d+$/],
    [/^GREEN_NEW_\d+$/, /^GREEN_\d+$/],
    [/^RED_NEW_\d+$/, /^RED_\d+$/],
    [/^YELLOW_NEW_\d+$/, /^YELLOW_\d+$/],
    [/^ORANGE_NEW_\d+$/, /^ORANGE_\d+$/],
    [/^TEAL_NEW_\d+$/, /^TEAL_\d+$/],
];

/**
 * Text and icons on filled, colored controls (buttons, badges, the send button, checked boxes). Old Discord drew them
 * in the raw color WHITE, which themes with pastel accents make dark so they stay readable; the current one draws
 * them in the same near-white as switch thumbs and text over pictures, which must stay light. Discord 351 renamed
 * BADGE_TEXT_BRAND to BADGE_PRIMARY_TEXT.
 */
const ON_COLOR: string[] = [
    "CONTROL_PRIMARY_TEXT_DEFAULT", "CONTROL_CRITICAL_PRIMARY_TEXT_DEFAULT", "CONTROL_CONNECTED_TEXT_DEFAULT",
    "BADGE_TEXT_BRAND", "BADGE_PRIMARY_TEXT", "CHAT_INPUT_SEND_BUTTON_ICON_ACTIVE_TINT", "CHECKBOX_ICON_ACTIVE",
];

/**
 * Colors Discord also takes from the raw color WHITE, but draws on its own surfaces or over pictures: the navigation
 * header's back and close buttons, outlined and secondary buttons, text over images. The dark WHITE of themes with
 * pastel accents would hide them, so they take the theme's text color for the same role, or else stay Discord's white.
 */
const ON_SURFACE: Record<string, string[]> = {
    NAVIGATOR_HEADER_TINT: ["HEADER_PRIMARY", "INTERACTIVE_ACTIVE", "TEXT_NORMAL"],
    BUTTON_OUTLINE_PRIMARY_TEXT: ["TEXT_NORMAL"],
    MOBILE_LEGACY_BUTTON_SECONDARY_TEXT_DEFAULT: ["TEXT_NORMAL"],
    APP_MESSAGE_EMBED_SECONDARY_TEXT: ["TEXT_MUTED", "HEADER_SECONDARY"],
    CONTENT_INVENTORY_OVERLAY_TEXT_PRIMARY: [],
    CONTENT_INVENTORY_OVERLAY_TEXT_SECONDARY: [],
    PROFILE_GRADIENT_ROLE_PILL_BORDER: [],
};
const WHITE = /^WHITE(_500)?$/;

const rawFallbacks = new WeakMap<InternalColorDefinition, Map<string, string | null>>();

/**
 * The theme's color for a raw color it doesn't define itself: its color for the old raw color closest to this one in
 * Discord's own palette. Worked out once per theme and color.
 */
export function legacyRawColor(theme: InternalColorDefinition, key: string, discordRaw: Record<string, string>): string | undefined {
    let cache = rawFallbacks.get(theme);
    if (!cache) rawFallbacks.set(theme, cache = new Map());
    if (cache.has(key)) return cache.get(key) ?? undefined;

    let found: string | null = null;
    const palette = PALETTES.find(([newPalette]) => newPalette.test(key));
    const original = discordRaw[key];
    if (palette && original && chroma.valid(original)) {
        let best = Infinity;
        for (const [oldKey, value] of Object.entries(theme.raw)) {
            const oldOriginal = discordRaw[oldKey];
            if (!value || !palette[1].test(oldKey) || !oldOriginal || !chroma.valid(oldOriginal)) continue;
            const distance = chroma.deltaE(original, oldOriginal);
            if (distance < best) {
                best = distance;
                found = value;
            }
        }
    }
    cache.set(key, found);
    return found ?? undefined;
}

/**
 * The theme's color for a semantic color it doesn't define itself, when the theme would otherwise get it wrong: a new
 * color it only defines under an old name, or one Discord takes from the raw color WHITE that the theme made dark.
 * `discordDef` is Discord's own definition of the color for the current theme, `discordRaw` its raw colors.
 */
export function legacySemanticColor(theme: InternalColorDefinition, name: string, discordDef?: { raw?: string; opacity?: number; }, discordRaw?: Record<string, string>) {
    for (const oldName of LEGACY_SEMANTIC[name] ?? []) {
        const def = theme.semantic[oldName];
        if (def?.value) return def;
    }
    if (ON_COLOR.includes(name)) {
        const white = theme.raw.WHITE_500 || theme.raw.WHITE;
        if (white) return { value: white, opacity: 1 };
    }
    if (name in ON_SURFACE && discordDef?.raw && WHITE.test(discordDef.raw)) {
        for (const oldName of ON_SURFACE[name]) {
            const def = theme.semantic[oldName];
            if (def?.value) return def;
        }
        const white = discordRaw?.[discordDef.raw];
        if (white) return { value: white, opacity: discordDef.opacity ?? 1 };
    }
    return undefined;
}
