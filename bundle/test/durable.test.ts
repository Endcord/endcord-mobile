// Storage files that survive a bad write: the file, its last good copy, and the damaged one kept aside
import { describe, expect, test } from "bun:test";

import { SRC } from "./src";
const { BACKUP_EVERY, readDurably, writeDurably } = await import(SRC + "lib/api/storage/durable.ts");

function memoryFile(initial: Record<string, string> = {}, { failRead = false, failWrite = new Set<string>() } = {}) {
    const files = new Map(Object.entries(initial));
    const writes: string[] = [];
    return {
        files,
        writes,
        read: async (suffix: string) => {
            if (failRead && suffix === "") throw new Error("I/O error");
            return files.get(suffix);
        },
        write: async (suffix: string, text: string) => {
            if (failWrite.has(suffix)) throw new Error("disk full");
            writes.push(suffix);
            files.set(suffix, text);
        },
    };
}

describe("writing", () => {
    test("the file every time, its copy at most every BACKUP_EVERY", async () => {
        const file = memoryFile();
        await writeDurably(file, "a", '{"n":1}', 1_000_000);
        expect(file.files.get("")).toBe('{"n":1}');
        expect(file.files.get(".bak")).toBe('{"n":1}');
        await writeDurably(file, "a", '{"n":2}', 1_000_000 + BACKUP_EVERY - 1);
        expect(file.files.get("")).toBe('{"n":2}');
        expect(file.files.get(".bak")).toBe('{"n":1}');
        await writeDurably(file, "a", '{"n":3}', 1_000_000 + BACKUP_EVERY + 5);
        expect(file.files.get(".bak")).toBe('{"n":3}');
    });

    test("each storage has its own clock", async () => {
        const one = memoryFile(), two = memoryFile();
        await writeDurably(one, "one", "1", 5_000_000);
        await writeDurably(two, "two", "2", 5_000_001);
        expect(two.files.get(".bak")).toBe("2");
    });

    test("a copy that can't be written doesn't fail the write", async () => {
        const file = memoryFile({}, { failWrite: new Set([".bak"]) });
        await writeDurably(file, "c", "{}", 9_000_000);
        expect(file.files.get("")).toBe("{}");
    });

    test("a file that can't be written fails the write", async () => {
        const file = memoryFile({}, { failWrite: new Set([""]) });
        await expect(writeDurably(file, "d", "{}", 9_500_000)).rejects.toThrow("disk full");
    });
});

describe("reading", () => {
    test("a good file", async () => {
        expect(await readDurably(memoryFile({ "": '{"a":1}' }), "k")).toEqual({ value: { a: 1 }, recovered: false });
    });

    test("no file: nothing, even with a copy, since that's how a deleted storage looks", async () => {
        const file = memoryFile({ ".bak": '{"a":1}' });
        expect(await readDurably(file, "k")).toBeUndefined();
        expect(file.writes).toEqual([]);
    });

    test("a damaged file comes back from its copy, and is kept aside", async () => {
        const file = memoryFile({ "": '{"a":1', ".bak": '{"a":0}' });
        expect(await readDurably(file, "k")).toEqual({ value: { a: 0 }, recovered: true });
        expect(file.files.get(".damaged")).toBe('{"a":1');
        expect(file.files.get("")).toBe('{"a":0}');
    });

    test("damaged with no good copy: nothing, and the damaged text kept", async () => {
        const file = memoryFile({ "": "garbage", ".bak": "also garbage" });
        expect(await readDurably(file, "k")).toBeUndefined();
        expect(file.files.get(".damaged")).toBe("garbage");
        expect(file.files.get("")).toBe("garbage");
    });

    test("an empty file, the usual damage, doesn't replace a damaged copy kept before", async () => {
        const file = memoryFile({ "": "", ".bak": "[1]", ".damaged": "earlier damage" });
        expect(await readDurably(file, "k")).toEqual({ value: [1], recovered: true });
        expect(file.files.get(".damaged")).toBe("earlier damage");
    });

    test("a file that can't be read comes back from its copy", async () => {
        const file = memoryFile({ "": '{"new":1}', ".bak": '{"old":1}' }, { failRead: true });
        expect(await readDurably(file, "k")).toEqual({ value: { old: 1 }, recovered: true });
        expect(file.writes.includes(".damaged")).toBe(false);
    });

    test("a file that was busy for a moment is read again", async () => {
        let reads = 0;
        const file = {
            read: async (suffix: string) => {
                if (suffix === "" && reads++ === 0) throw new Error("busy");
                return suffix === "" ? '{"a":1}' : undefined;
            },
            write: async () => { },
        };
        expect(await readDurably(file, "k")).toEqual({ value: { a: 1 }, recovered: false });
    });

    test("writing the copy back can fail without failing the read", async () => {
        const file = memoryFile({ "": "{", ".bak": "{}" }, { failWrite: new Set(["", ".damaged"]) });
        expect(await readDurably(file, "k")).toEqual({ value: {}, recovered: true });
    });
});
