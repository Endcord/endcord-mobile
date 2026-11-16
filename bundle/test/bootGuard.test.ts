// Safe mode after failed starts: the record of starts, and what a start that came up writes
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";
const appStateListeners: ((state: string) => void)[] = [];
mock.module("react-native", () => ({
    AppState: {
        addEventListener: (_: string, listener: (state: string) => void) => {
            appStateListeners.push(listener);
            return { remove: () => appStateListeners.splice(appStateListeners.indexOf(listener), 1) };
        },
    },
}));
let stored: unknown = {};
const sets: unknown[] = [];
mock.module(SRC + "core/vendetta/storage.ts", () => ({
    createMMKVBackend: () => ({
        get: async () => stored,
        set: async (value: unknown) => {
            stored = JSON.parse(JSON.stringify(value));
            sets.push(stored);
        },
    }),
}));
const loaderCalls: string[] = [];
mock.module(SRC + "lib/api/native/modules/index.ts", () => ({
    callLoaderMethod: (name: string) => {
        loaderCalls.push(name);
        throw new Error("no such method on this loader");
    },
    setBeforeReload: (fn: () => unknown) => void (beforeReload = fn),
}));
let beforeReload: () => unknown = () => { };

const guard = await import(SRC + "core/debug/bootGuard.ts");
const { beginBoot, confirmBoot, FAILED_STARTS_BEFORE_SAFE_MODE, readBootRecord, suspectsOf } = guard;

describe("the record", () => {
    test("anything stored comes back in shape", () => {
        for (const raw of [undefined, null, 5, "x", [], { pending: -3 }, { pending: "2" }, { pending: 1.5 }, { pending: 1e9 }, { lastGood: "a" }, { lastGood: [1, "a", "a", "", null, "b".repeat(300)] }]) {
            const record = readBootRecord(raw);
            expect(Number.isSafeInteger(record.pending) && record.pending >= 0 && record.pending <= 1000).toBe(true);
            expect(Array.isArray(record.lastGood) && record.lastGood.every(n => typeof n === "string" && n.length > 0 && n.length < 200)).toBe(true);
        }
        expect(readBootRecord({ pending: "2", lastGood: ["a", "a", "b"] })).toEqual({ pending: 2, lastGood: ["a", "b"] });
        expect(readBootRecord({ pending: 1e9 }).pending).toBe(1000);
    });

    test("safe mode on the start after three that didn't come up, and not before", () => {
        let record = readBootRecord(undefined);
        const safe: boolean[] = [];
        for (let i = 0; i < 6; i++) {
            const [next, state] = beginBoot(record, false);
            safe.push(state.safeModeFromCrashes);
            expect(state.failedStarts).toBe(i);
            record = next;
        }
        expect(FAILED_STARTS_BEFORE_SAFE_MODE).toBe(3);
        expect(safe).toEqual([false, false, false, true, true, true]);
    });

    test("not when safe mode is on already", () => {
        expect(beginBoot({ pending: 5, lastGood: [] }, true)[1].safeModeFromCrashes).toBe(false);
    });

    test("a start that comes up clears the count; a safe one keeps what's known about the plugins", () => {
        expect(confirmBoot({ pending: 4, lastGood: ["a"] }, ["b", "c"])).toEqual({ pending: 0, lastGood: ["b", "c"] });
        expect(confirmBoot({ pending: 4, lastGood: ["a"] }, null)).toEqual({ pending: 0, lastGood: ["a"] });
    });

    test("the suspects are the plugins turned on since the last good start", () => {
        expect(suspectsOf({ safeModeFromCrashes: true, failedStarts: 3, lastGood: ["a", "b"] }, ["a", "c", "d"])).toEqual(["c", "d"]);
        expect(suspectsOf({ safeModeFromCrashes: true, failedStarts: 3, lastGood: [] }, [])).toEqual([]);
    });
});

describe("a start", () => {
    test("the reload hook is set before plugins run", async () => {
        const fresh = await import(SRC + "core/debug/bootGuard.ts?hook");
        stored = { pending: 0, lastGood: [] };
        await fresh.startBootGuard(() => false);
        expect(typeof beforeReload).toBe("function");
        expect(beforeReload).toBe(fresh.noteDeliberateReload);
    });

    test("is counted before plugins run, and confirmed once", async () => {
        stored = { pending: 2, lastGood: ["x"] };
        const state = await guard.startBootGuard(() => false);
        expect(state).toEqual({ safeModeFromCrashes: false, failedStarts: 2, lastGood: ["x"] });
        expect(stored).toEqual({ pending: 3, lastGood: ["x"] });

        // Leaving the app the normal way counts as coming up, like the timer
        guard.watchForStableStart(() => ["x", "y"]);
        expect(appStateListeners.length).toBe(1);
        appStateListeners[0]("inactive");
        expect(loaderCalls).toEqual([]);
        appStateListeners[0]("background");
        await guard.confirmStart(["ignored"]);
        expect(stored).toEqual({ pending: 0, lastGood: ["x", "y"] });
        // The loader is told, and one without the method doesn't stop anything
        expect(loaderCalls).toEqual(["endcord.bundle.confirm"]);
        expect(appStateListeners.length).toBe(0);

        // Once per start
        const count = sets.length;
        await guard.confirmStart(["z"]);
        expect(sets.length).toBe(count);
        expect(loaderCalls.length).toBe(1);
    });

    test("a damaged or unreadable record never stops Discord", async () => {
        const fresh = await import(SRC + "core/debug/bootGuard.ts?unreadable");
        stored = "not an object";
        expect((await fresh.startBootGuard(() => false)).safeModeFromCrashes).toBe(false);
        expect(stored).toEqual({ pending: 1, lastGood: [] });
    });

    test("after the crash screen, it never counts as one that came up", async () => {
        const fresh = await import(SRC + "core/debug/bootGuard.ts?crash");
        stored = { pending: 0, lastGood: [] };
        await fresh.startBootGuard(() => false);
        fresh.watchForStableStart(() => ["a"]);
        fresh.noteCrash();
        expect(appStateListeners.length).toBe(0);
        fresh.watchForStableStart(() => ["a"]);
        expect(appStateListeners.length).toBe(0);
        await new Promise(r => setTimeout(r, 10));
        expect(stored).toEqual({ pending: 1, lastGood: [] });
    });

    test("the plugins it started with are the good ones, not one turned on meanwhile", async () => {
        const fresh = await import(SRC + "core/debug/bootGuard.ts?started-with");
        stored = { pending: 1, lastGood: [] };
        await fresh.startBootGuard(() => false);
        let on = ["a"];
        fresh.watchForStableStart(() => on);
        on = ["a", "new"];
        appStateListeners[0]("background");
        await fresh.confirmStart(null);
        expect(stored).toEqual({ pending: 0, lastGood: ["a"] });
    });

    test("after the crash screen, nothing confirms it, safe mode from there included", async () => {
        const fresh = await import(SRC + "core/debug/bootGuard.ts?crash-confirm");
        stored = { pending: 2, lastGood: ["x"] };
        await fresh.startBootGuard(() => false);
        const calls = loaderCalls.length;
        fresh.noteCrash();
        await fresh.confirmStart(null);
        await fresh.noteDeliberateReload();
        expect(loaderCalls.length).toBe(calls);
        expect(stored).toEqual({ pending: 3, lastGood: ["x"] });
    });

    test("a reload that was asked for counts, but not one straight after the start", async () => {
        const fresh = await import(SRC + "core/debug/bootGuard.ts?reload");
        stored = { pending: 2, lastGood: ["x"] };
        await fresh.startBootGuard(() => false);
        // Before Endcord is ready
        await fresh.noteDeliberateReload();
        expect(stored).toEqual({ pending: 3, lastGood: ["x"] });
        fresh.watchForStableStart(() => ["x", "y"]);
        // Right after it's ready, as a plugin that reloads as it starts would
        await fresh.noteDeliberateReload();
        expect(stored).toEqual({ pending: 3, lastGood: ["x"] });
        const realNow = Date.now;
        Date.now = () => realNow() + fresh.DELIBERATE_RELOAD_AFTER + 1;
        try {
            await fresh.noteDeliberateReload();
        } finally {
            Date.now = realNow;
        }
        // Not a failed start, and nothing new known about the plugins
        expect(stored).toEqual({ pending: 0, lastGood: ["x"] });
        appStateListeners.splice(0);
    });
});
