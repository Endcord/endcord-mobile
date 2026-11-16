/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * DisableCameras' choices, apart from Discord so they can be tested.
 */

const SNOWFLAKE = /^\d{15,21}$/;

/** People whose camera the plugin turned off and the setting Discord had for them before, kept at most */
export const MAX_TRACKED = 200;

/**
 * Whose cameras to turn off in a call: everyone else whose camera is on and who hasn't been seen with it on yet this
 * call, so turning one back on yourself sticks
 */
export function camerasToTurnOff(states: Record<string, any> | null | undefined, me: string | undefined, handled: ReadonlySet<string>): string[] {
    if (!states || typeof states !== "object") return [];
    const out: string[] = [];
    for (const [key, state] of Object.entries(states)) {
        const userId = typeof state?.userId === "string" ? state.userId : key;
        if (!SNOWFLAKE.test(userId) || userId === me || handled.has(userId)) continue;
        if (state?.selfVideo === true) out.push(userId);
    }
    return out;
}

/**
 * Whether the saved record has anything in it, junk included: an empty one isn't written again, since every write is
 * a file written to the phone's storage
 */
export function hasTracked(raw: unknown): boolean {
    if (raw === undefined) return false;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
    for (const _ in raw) return true;
    return false;
}

/** The saved record, without what isn't a person and a setting name */
export function validTracked(raw: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    let count = 0;
    for (const [userId, previous] of Object.entries(raw as Record<string, unknown>)) {
        if (!SNOWFLAKE.test(userId) || typeof previous !== "string" || previous.length > 40) continue;
        if (++count > MAX_TRACKED) break;
        out[userId] = previous;
    }
    return out;
}
