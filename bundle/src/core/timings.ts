/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * How long Endcord's startup took, for the StartupTimings plugin and the emulator self-test.
 */

export interface Timings {
    /** When the bundle started running */
    loaded: number;
    /** When Endcord's own startup finished */
    ready?: number;
    /** How long each Endcord plugin took to start, in milliseconds */
    plugins: Record<string, number>;
    /** How long each step of Endcord's startup took, in milliseconds, until what it returned settled */
    steps?: Record<string, number>;
}

const timings: Timings = (globalThis as any).__ENDCORD_TIMINGS__ ??= { loaded: Date.now(), plugins: {} };

/** Runs a startup step and records how long it took, including the work it waits for */
export function step<T>(name: string, run: () => T): T {
    const started = Date.now();
    const record = () => void ((timings.steps ??= {})[name] = Date.now() - started);
    const result = run();
    if (result instanceof Promise) result.then(record, record);
    else record();
    return result;
}

export const getTimings = (): Timings => timings;

export function markReady() {
    timings.ready ??= Date.now();
}

export function recordPluginStart(id: string, ms: number) {
    timings.plugins[id] = ms;
}
