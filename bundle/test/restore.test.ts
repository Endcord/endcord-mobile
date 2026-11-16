// Backup restore, snapshots and the safe-mode setting, against a file someone else made
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";
mock.module(SRC + "core/i18n/index.ts", () => ({
    t: (s: string, v?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v?.[k] ?? `{${k}}`)),
    tx: (s: string) => s,
}));

// backup.ts pulls in a lot of Discord; test the pure helper it uses for restore through a tiny re-export shim
mock.module("bunny-build-info", () => ({ version: "1.0.0" }));
mock.module("react-native", () => ({ Platform: { OS: "android", select: (o: any) => o.android ?? o.default } }));
mock.module(SRC + "core/backup.ts", () => ({ createBackup: async () => "{}", parseBackup: (t: string) => JSON.parse(t), restoreBackup: async () => 0 }));

describe("snapshots", () => {
    // snapshots.ts only needs storage and backup mocked; test readSnapshots directly, which is pure
    mock.module(SRC + "core/vendetta/storage.ts", () => ({
        createMMKVBackend: () => ({ get: async () => ({ list: [] }), set: async () => { } }),
    }));

    test("entries dated in the future are left out, so they can't stay newest for good", async () => {
        const { readSnapshots } = await import(SRC + "core/snapshots.ts");
        const now = 1_800_000_000_000;
        const DAY = 24 * 60 * 60 * 1000;
        const list = [
            { at: now - DAY, reason: "daily", text: "{}", endcord: "1" },
            { at: now + 5 * DAY, reason: "daily", text: "{}", endcord: "1" },
            { at: 4e12, reason: "daily", text: "{}", endcord: "1" },
            { at: -1, reason: "daily", text: "{}", endcord: "1" },
            { at: 1.5e300, reason: "daily", text: "{}", endcord: "1" },
        ];
        const kept = readSnapshots({ list }, now).map(s => s.at);
        expect(kept).toEqual([now - DAY]);
    });
});

describe("the safe-mode setting, in whatever shape a hand-edited file holds it", () => {
    let current: any = {};
    mock.module(SRC + "lib/api/settings.ts", () => ({ settings: new Proxy({}, { get: (_, k) => current[k], set: (_, k, v) => (current[k] = v, true) }) }));
    mock.module(SRC + "lib/addons/themes/index.ts", () => ({ getCurrentTheme: () => null, getThemeFromLoader: () => null, selectTheme: async () => { }, themes: {}, writeThemeToNative: async () => { } }));
    mock.module(SRC + "lib/api/native/modules/index.ts", () => ({ BundleUpdaterManager: { reload: () => { } } }));
    mock.module(SRC + "lib/api/storage/index.ts", () => ({ flushStorages: async () => { } }));
    mock.module(SRC + "core/debug/bootGuard.ts", () => ({ confirmStart: async () => { } }));

    test("normalizing makes isSafeMode and a truthy read agree", async () => {
        const { isSafeMode, normalizeSafeModeSetting } = await import(SRC + "core/debug/safeMode.ts");
        for (const [raw, on] of [
            [{ enabled: 1 }, false], [{ enabled: "true" }, false], [{ enabled: {} }, false],
            [{ enabled: true }, true], [1, false], ["x", false], [[], false], [{ enabled: false, currentThemeId: "t" }, false],
        ] as const) {
            current = { safeMode: JSON.parse(JSON.stringify(raw)) };
            normalizeSafeModeSetting();
            // After normalizing, the setting is an object with a boolean, so every reader agrees
            expect(typeof current.safeMode.enabled).toBe("boolean");
            expect(isSafeMode()).toBe(on);
            expect(Boolean(current.safeMode.enabled)).toBe(on);
        }
        // A theme kept before safe mode survives normalizing
        current = { safeMode: { enabled: true, currentThemeId: "mytheme", enabled2: 1 } };
        normalizeSafeModeSetting();
        expect(current.safeMode.currentThemeId).toBe("mytheme");
    });
});
