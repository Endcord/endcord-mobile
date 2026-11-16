/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * How much of the screen's edges the system bars cover. Discord draws edge to edge, and Android 15 and newer make every
 * app do so: a button along the bottom of a page then sits under the navigation bar, where taps go to the bar instead
 * of the button. On iPhones the home indicator covers the bottom edge the same way.
 */

import { useSafeAreaInsets } from "@metro/common/components";

export interface EdgeInsets {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

const NO_INSETS: EdgeInsets = Object.freeze({ top: 0, bottom: 0, left: 0, right: 0 });

const edge = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

/** Turns what the safe area module reports into four finite, non-negative numbers */
export function normalizeInsets(raw: unknown): EdgeInsets {
    if (!raw || typeof raw !== "object") return NO_INSETS;
    const r = raw as Partial<Record<keyof EdgeInsets, unknown>>;
    return { top: edge(r.top), bottom: edge(r.bottom), left: edge(r.left), right: edge(r.right) };
}

/**
 * The screen's insets, from Discord's own safe area module. Without it, or outside its provider, none: the page still
 * draws, as it did before.
 */
export function useEdgeInsets(): EdgeInsets {
    let raw: unknown;
    try {
        raw = useSafeAreaInsets();
    } catch {
        // Missing on this Discord, or no provider above this page. The hook throws the same way on every render, so
        // React sees the same hooks each time.
        return NO_INSETS;
    }
    return normalizeInsets(raw);
}

/**
 * What a bar along the bottom of the screen needs below its content: the system bar's height, or a small gap where
 * there is none.
 */
export function bottomBarPadding(insets: EdgeInsets, gap: number) {
    return Math.max(gap, insets.bottom + Math.min(gap, 6));
}

/** Room for a row of buttons, in density-independent pixels, as the user's text size makes their labels grow */
export function layoutWidth(width: number, fontScale: number) {
    const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
    return (Number.isFinite(width) && width > 0 ? width : 0) / scale;
}
