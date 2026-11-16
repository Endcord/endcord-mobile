// The copies of the settings kept on the phone
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";
let stored: unknown = { list: [] };
mock.module(SRC + "core/vendetta/storage.ts", () => ({
    createMMKVBackend: () => ({
        get: async () => stored,
        set: async (value: unknown) => void (stored = JSON.parse(JSON.stringify(value))),
    }),
}));
let current = { settings: { language: "tr" }, plugins: { a: true } };
const restored: unknown[] = [];
const events: string[] = [];
mock.module(SRC + "core/backup.ts", () => ({
    createBackup: async ({ withData = true } = {}) => {
        events.push(`create withData=${withData}`);
        return JSON.stringify({ format: 1, createdAt: new Date().toISOString(), endcord: "1.0", ...current });
    },
    parseBackup: (text: string) => {
        const parsed = JSON.parse(text);
        if (parsed.format !== 1) throw new Error("This file isn't an Endcord backup");
        return parsed;
    },
    restoreBackup: async (backup: unknown) => {
        events.push("restore");
        restored.push(backup);
        return 0;
    },
}));
mock.module("bunny-build-info", () => ({ version: "9.9.9" }));

const { MAX_SNAPSHOTS, listSnapshots, readSnapshots, restoreSnapshot, takeDailySnapshot, takeSnapshot, withSnapshot } = await import(SRC + "core/snapshots.ts");
const DAY = 24 * 60 * 60 * 1000;
const snap = (at: number, text = `{"n":${at}}`, reason: "daily" | "before-restore" = "daily") => ({ at, reason, endcord: "1", text });

describe("the list", () => {
    test("whatever is stored is checked, newest first, at most ten", () => {
        expect(readSnapshots(undefined)).toEqual([]);
        expect(readSnapshots({ list: "x" })).toEqual([]);
        const list = readSnapshots({
            list: [
                snap(1), snap(3), { at: "2", reason: "daily", text: "{}" }, { at: 4, reason: "other", text: "{}" }, { at: 5, reason: "daily", text: 7 },
                { at: 6, reason: "daily", text: "{}", endcord: 12 }, { at: 7, reason: "daily", text: "x".repeat(2 * 1024 * 1024 + 1) },
                ...Array.from({ length: 15 }, (_, i) => snap(100 + i)),
            ],
        });
        expect(list.length).toBe(MAX_SNAPSHOTS);
        expect(list.map(s => s.at)).toEqual(Array.from({ length: 10 }, (_, i) => 114 - i));
        const odd = readSnapshots({ list: [{ at: 6, reason: "daily", text: "{}", endcord: 12 }] });
        expect(odd[0].endcord).toBe("?");
    });

    test("the same settings twice in a row are kept once, at the newer time", () => {
        const a = JSON.stringify({ createdAt: "monday", endcord: "1", settings: { x: 1 } });
        const b = JSON.stringify({ createdAt: "tuesday", endcord: "2", settings: { x: 1 } });
        const c = JSON.stringify({ createdAt: "tuesday", endcord: "2", settings: { x: 2 } });
        const one = withSnapshot([], snap(1, a));
        const two = withSnapshot(one, snap(2, b));
        expect(two.length).toBe(1);
        expect(two[0].at).toBe(2);
        expect(two[0].text).toBe(a);
        expect(withSnapshot(two, snap(3, c)).length).toBe(2);
        // A different reason is its own entry
        expect(withSnapshot(two, snap(3, b, "before-restore")).length).toBe(2);
    });

    test("the oldest goes past ten", () => {
        let list: ReturnType<typeof readSnapshots> = [];
        for (let i = 0; i < 25; i++) list = withSnapshot(list, snap(i));
        expect(list.length).toBe(MAX_SNAPSHOTS);
        expect(list[0].at).toBe(24);
        expect(list.at(-1)!.at).toBe(15);
    });
});

describe("taking and restoring", () => {
    test("a daily copy once a day, without what plugins made", async () => {
        stored = { list: [] };
        const now = 1_700_000_000_000;
        await takeDailySnapshot(now);
        expect(events).toEqual(["create withData=false"]);
        current = { ...current, settings: { language: "fr" } };
        await takeDailySnapshot(now + DAY - 1);
        expect((await listSnapshots()).length).toBe(1);
        await takeDailySnapshot(now + DAY);
        expect((await listSnapshots()).length).toBe(2);
        // A clock set back doesn't stop the copies
        await takeDailySnapshot(now - 5 * DAY);
        expect((await listSnapshots()).some(s => s.at === now - 5 * DAY)).toBe(true);
        expect((await listSnapshots())[0].endcord).toBe("9.9.9");
    });

    test("restoring keeps the settings of now as a copy first", async () => {
        stored = { list: [] };
        events.length = 0;
        current = { settings: { language: "es" }, plugins: { a: false } };
        await takeSnapshot("daily", 10);
        const [daily] = await listSnapshots();
        current = { settings: { language: "ru" }, plugins: { a: true } };
        await restoreSnapshot(daily);
        expect(events).toEqual(["create withData=false", "create withData=false", "restore"]);
        expect((restored.at(-1) as any).settings.language).toBe("es");
        const list = await listSnapshots();
        expect(list.map(s => s.reason).sort()).toEqual(["before-restore", "daily"]);
        expect(JSON.parse(list.find(s => s.reason === "before-restore")!.text).settings.language).toBe("ru");
    });

    test("a snapshot that isn't a backup is refused before anything changes", async () => {
        events.length = 0;
        await expect(restoreSnapshot(snap(1, '{"format":2}'))).rejects.toThrow();
        expect(events).toEqual([]);
    });

    test("one failed copy doesn't stop the next", async () => {
        stored = { list: [] };
        const backup = await import(SRC + "core/backup.ts");
        const original = backup.createBackup;
        let fail = true;
        mock.module(SRC + "core/backup.ts", () => ({
            ...backup,
            createBackup: async (o: any) => {
                if (fail) throw new Error("no");
                return original(o);
            },
        }));
        await expect(takeSnapshot("daily", 1)).rejects.toThrow();
        fail = false;
        await takeSnapshot("daily", 2);
        expect((await listSnapshots()).length).toBe(1);
    });
});
