/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Whether no key anywhere in a value could change an object's prototype once it's copied or merged, as Endcord PC
 * checks the settings it imports. For JSON from elsewhere: themes, manifests, repositories and backups. Too deep to
 * check counts as unsafe.
 */
export function isSafeObject(value: unknown, depth = 0): boolean {
    if (depth > 64) return false;
    if (typeof value !== "object" || value === null) return true;
    for (const key of Object.keys(value)) {
        if (UNSAFE_KEYS.has(key)) return false;
        if (!isSafeObject((value as Record<string, unknown>)[key], depth + 1)) return false;
    }
    return true;
}
