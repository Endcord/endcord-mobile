/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * SecretRingToneEnabler's choice of sound, and how Discord's own is asked for when that one doesn't come, apart from
 * Discord so they can be tested.
 */

/** Discord's usual ringtone, its secret version, and the Snow Halation theme */
export const RINGING = "call_ringing", SECRET = "call_ringing_beat", SNOW = "call_ringing_snow_halation";

/**
 * How long the sound player has to answer for the other ringtone before Discord's own is asked for instead: a sound
 * the app doesn't have might never be answered for, and a call would then ring without a sound
 */
export const PREPARE_WAIT = 3000;

export type SoundCallback = (error: unknown, sound: unknown) => void;

export interface Timers {
    set(fn: () => void, ms: number): unknown;
    clear(handle: unknown): void;
}

const realTimers: Timers = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Asks the sound player for the other ringtone and hands Discord's callback what it answers. When it fails, throws,
 * or doesn't answer within `wait`, `fallBack` asks for Discord's own ringtone instead, exactly once, and an answer that
 * comes later is ignored, so Discord's callback is never called twice. Returns what the first ask returned.
 */
export function askWithFallback(
    ask: (callback: SoundCallback) => unknown,
    done: SoundCallback | undefined,
    fallBack: (reason: unknown) => unknown,
    wait = PREPARE_WAIT,
    timers: Timers = realTimers,
): unknown {
    let settled = false;
    // Run from a timer or the sound player's callback, where an error would reach the app's error handler
    const fallBackSafely = (reason: unknown) => {
        try {
            fallBack(reason);
        } catch (e) {
            console.error("[Endcord] SecretRingToneEnabler couldn't ask for Discord's own ringtone", e);
        }
    };
    /** True for the first of the answer, the error and the timeout, which decides */
    const settle = () => {
        if (settled) return false;
        settled = true;
        // Only called once the timer below is set: by it, or by the ask that comes after it
        timers.clear(timer);
        return true;
    };
    const timer = timers.set(() => {
        if (settle()) fallBackSafely(new Error(`the sound player didn't answer within ${wait} ms`));
    }, wait);
    try {
        return ask((error, sound) => {
            if (!settle()) return;
            if (error) fallBackSafely(error);
            else if (typeof done === "function") done(error, sound);
        });
    } catch (e) {
        return settle() ? fallBack(e) : undefined;
    }
}

/**
 * The ringtone to play instead of the one Discord asked for, or nothing to keep it. Only the usual ringtone is
 * changed, so the ones for special ringtone events stay.
 */
export function ringtoneFor(name: unknown, onlySnow: boolean): string | undefined {
    if (name === RINGING) return onlySnow ? SNOW : SECRET;
    if (name === SECRET && onlySnow) return SNOW;
    return undefined;
}
