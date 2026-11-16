/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's boot guard (src/shared/bootGuard.ts and src/api/SafeMode.ts there), for the phone. A plugin that breaks
 * Discord at startup would leave nothing to tap to turn it off, so every start counts as failed until Discord has come
 * up and stayed up, and after three failed starts in a row Endcord starts in safe mode, with its plugins and themes
 * off, and says which plugins were turned on since the last start that came up: the likeliest cause.
 *
 * A start counts as one that came up when Discord has been up for a while, or when the person leaves the app the
 * normal way (to the home screen or another app). A crash does neither.
 */

import { createMMKVBackend, type StorageBackend } from "@core/vendetta/storage";
import { callLoaderMethod, setBeforeReload } from "@lib/api/native/modules";
import { AppState } from "react-native";

export const FAILED_STARTS_BEFORE_SAFE_MODE = 3;
/** How long Discord has to stay up after Endcord is ready, with no crash, before a start counts as a good one */
export const STABLE_AFTER = 20_000;
const MAX_PLUGINS = 1000;

export interface BootRecord {
    /** Starts since the last one that came up properly, the current one included */
    pending: number;
    /** The plugins that were on the last time Discord came up properly, outside safe mode */
    lastGood: string[];
}

export interface BootState {
    /** Whether this start turned safe mode on itself, after failed starts */
    safeModeFromCrashes: boolean;
    failedStarts: number;
    lastGood: string[];
}

const names = (value: unknown) => Array.isArray(value)
    ? [...new Set(value.filter((name): name is string => typeof name === "string" && name.length > 0 && name.length < 200))].slice(0, MAX_PLUGINS)
    : [];

/** Whatever was stored, damaged or written by another version, comes back in this shape */
export function readBootRecord(raw: unknown): BootRecord {
    const record = raw !== null && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const pending = Number(record.pending);
    return {
        pending: Number.isSafeInteger(pending) && pending > 0 ? Math.min(pending, 1000) : 0,
        lastGood: names(record.lastGood),
    };
}

/** Records a start and decides whether it has to be a safe one */
export function beginBoot(record: BootRecord, alreadySafe: boolean): [BootRecord, BootState] {
    const failedStarts = record.pending;
    return [
        { ...record, pending: record.pending + 1 },
        { safeModeFromCrashes: !alreadySafe && failedStarts >= FAILED_STARTS_BEFORE_SAFE_MODE, failedStarts, lastGood: record.lastGood },
    ];
}

/**
 * Discord came up and stayed up. A safe start says nothing about the plugins, which were off, so it only clears the
 * count of failed starts and keeps what's known about them
 */
export function confirmBoot(record: BootRecord, enabledPlugins: string[] | null): BootRecord {
    return enabledPlugins ? { pending: 0, lastGood: names(enabledPlugins) } : { ...record, pending: 0 };
}

/** The plugins on now that weren't on the last time Discord came up: the likeliest cause of the failed starts */
export function suspectsOf(state: BootState, enabledNow: string[]) {
    const before = new Set(state.lastGood);
    return enabledNow.filter(id => !before.has(id));
}

// ---- Keeping the record --------------------------------------------------------------------------------------------

let backend: StorageBackend | undefined;
const store = () => backend ??= createMMKVBackend("ENDCORD_BOOT_GUARD", {});
let record: BootRecord = { pending: 0, lastGood: [] };
let confirmed = false;
let writing: Promise<unknown> = Promise.resolve();

function save() {
    const snapshot = { ...record };
    writing = writing.then(() => store().set(snapshot)).catch(e => console.error("[Endcord] The boot record couldn't be saved", e));
    return writing;
}

/**
 * Counts this start, before any plugin runs: the count has to be on disk before something can crash. Resolves to what
 * this start has to be; a failure to read or write the record never stops Discord from starting
 */
export async function startBootGuard(isSafeMode: () => boolean): Promise<BootState> {
    setBeforeReload(noteDeliberateReload);
    try {
        record = readBootRecord(await store().get());
        const [next, state] = beginBoot(record, isSafeMode());
        record = next;
        await save();
        return state;
    } catch (e) {
        console.error("[Endcord] The boot guard couldn't run", e);
        return { safeModeFromCrashes: false, failedStarts: 0, lastGood: [] };
    }
}

/**
 * Marks this start as one that came up. With the plugins that are on, unless they were off for safe mode. Never once
 * Discord's crash screen came up: "Reload in safe mode" there is chosen, but this start still didn't come up, and the
 * loader mustn't hear that the code that crashed is good
 */
export function confirmStart(enabledPlugins: string[] | null) {
    if (confirmed || crashed) return writing;
    confirmed = true;
    // The Android loader sets a new bundle aside after three loads that never get here, and puts the one before it back
    try {
        callLoaderMethod("endcord.bundle.confirm");
    } catch {
        // A loader without it: iOS, or an Android one from before
    }
    record = confirmBoot(record, enabledPlugins);
    return save();
}

let stableTimer: ReturnType<typeof setTimeout> | undefined;
/** The crash screen came up during this start */
let crashed = false;
/** When Endcord was ready, this start */
let readyAt: number | undefined;
/** How long after that a reload that was asked for counts as coming after a start that came up */
export const DELIBERATE_RELOAD_AFTER = 5000;
let appStateSubscription: { remove(): void; } | undefined;

function stopWatching() {
    clearTimeout(stableTimer);
    stableTimer = undefined;
    appStateSubscription?.remove();
    appStateSubscription = undefined;
}

/**
 * Once Endcord is ready: the start counts as one that came up after STABLE_AFTER, or as soon as the person leaves the
 * app the normal way, whichever comes first
 */
export function watchForStableStart(enabledPlugins: () => string[] | null, onStable?: () => void) {
    stopWatching();
    readyAt ??= Date.now();
    if (crashed) return;
    // The plugins this start started with: one turned on while it runs hasn't been through a start yet, so it isn't
    // known to be good
    let plugins: string[] | null = null;
    try {
        plugins = enabledPlugins();
    } catch (e) {
        console.error("[Endcord] The plugins that are on couldn't be listed", e);
    }
    const done = () => {
        stopWatching();
        if (crashed) return;
        confirmStart(plugins);
        try {
            onStable?.();
        } catch (e) {
            console.error("[Endcord] What runs after a good start failed", e);
        }
    };
    stableTimer = setTimeout(done, STABLE_AFTER);
    try {
        appStateSubscription = AppState.addEventListener("change", next => {
            if (next === "background") done();
        });
    } catch { }
}

/**
 * A reload Endcord was asked for, from a button, a command or a plugin: Discord came up far enough for that, so the start
 * isn't a failed one. It says nothing about the plugins, which keep what's known about them, as after a safe start.
 * Resolves once that's on disk, so the reload waits for it
 */
export function noteDeliberateReload() {
    // Not one that comes straight away: a plugin that reloads Discord as it starts would otherwise never be caught
    if (readyAt === undefined || Date.now() - readyAt < DELIBERATE_RELOAD_AFTER) return writing;
    return confirmStart(null);
}

/** Discord's crash screen came up: this start isn't one that came up, whatever happens next */
export function noteCrash() {
    crashed = true;
    stopWatching();
}
