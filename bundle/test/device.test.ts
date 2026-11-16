// A phone made of fakes, for the code that can't run on a PC otherwise: Endcord's real storage, boot guard, loader
// bridge and reload, against Discord's native file module as it behaves on Android and on both kinds of iOS.
// SIM=android | ios-new | ios-old picks the phone; run once for each.
import { describe, expect, mock, test } from "bun:test";

const SIM = (process.env.SIM ?? "android") as "android" | "ios-new" | "ios-old";
import { SRC } from "./src";
const ios = SIM !== "android";

// The older iOS file module writes from the app's folder, the others from the documents directory
const DOCS = SIM === "ios-old" ? "/home/Documents" : SIM === "ios-new" ? "/var/mobile/Documents" : "/data/user/0/com.discord/files";
const WRITE_ROOT = SIM === "ios-old" ? "/home" : DOCS;
const files = new Map<string, string>();
const fileModule: Record<string, any> = {
    getConstants: () => ({ DocumentsDirPath: DOCS, CacheDirPath: "/cache" }),
    fileExists: async (path: string) => files.has(path),
    readFile: async (path: string) => {
        if (!files.has(path)) throw new Error(`ENOENT ${path}`);
        return files.get(path);
    },
    writeFile: async (dir: string, path: string, data: string) => {
        files.set(`${dir === "documents" ? WRITE_ROOT : "/cache"}/${path}`, data);
        return path;
    },
    removeFile: async (dir: string, path: string) => files.delete(`${dir === "documents" ? WRITE_ROOT : "/cache"}/${path}`),
};
if (SIM !== "ios-old") fileModule.saveFileToGallery = async () => { };

const events: string[] = [];
const loaderCalls: string[] = [];
const g = globalThis as any;
g.window = g;
g.nativeModuleProxy = {
    [ios ? "DCDFileManager" : "NativeFileModule"]: fileModule,
    [ios ? "MMKVManager" : "NativeCacheModule"]: { getItem: async () => null, removeItem: () => { }, setItem: () => { } },
    BundleUpdaterManager: { reload: () => events.push("native reload") },
    // The Android loader answers through react-native-svg's getBBox, which it hooks
    RNSVGRenderableManager: {
        getBBox: (_: number, payload: any) => {
            loaderCalls.push(payload.revenge.method);
            return payload.revenge.method === "endcord.bundle.confirm" ? { result: true } : { error: "Unknown method" };
        },
    },
};
// The iOS loader's own bridge, which has neither of the new methods
if (ios) g.__ENDCORD_LOADER_CALL__ = (payload: any) => {
    loaderCalls.push(payload.revenge.method);
    return { error: `No method ${payload.revenge.method}\nat somewhere` };
};

const appState: ((state: string) => void)[] = [];
mock.module("react-native", () => ({
    Platform: { OS: ios ? "ios" : "android", select: (options: any) => (ios ? options.ios : options.android) ?? options.default },
    AppState: { addEventListener: (_: string, fn: (state: string) => void) => (appState.push(fn), { remove: () => appState.splice(appState.indexOf(fn), 1) }) },
}));

const modules = await import(SRC + "lib/api/native/modules/index.ts");
const storage = await import(SRC + "core/vendetta/storage.ts");
const stored = (name: string, suffix = "") => files.get(`${DOCS}/vd_mmkv/${name}${suffix}`);

describe(`storage on ${SIM}`, () => {
    test("what's written is where it's read from", async () => {
        const backend = storage.createMMKVBackend("SIM_A", { fresh: true });
        expect(await backend.get()).toEqual({ fresh: true });
        await backend.set({ n: 1 });
        expect(stored("SIM_A")).toBe('{"n":1}');
        expect(stored("SIM_A", ".bak")).toBe('{"n":1}');
        expect(await backend.get()).toEqual({ n: 1 });
        // Nothing lands outside the documents directory
        expect([...files.keys()].filter(path => !path.startsWith(`${DOCS}/`))).toEqual([]);
    });

    test("a damaged file comes back from its copy, in the same folder", async () => {
        const backend = storage.createMMKVBackend("SIM_B", {});
        await backend.get();
        await backend.set({ kept: "yes" });
        files.set(`${DOCS}/vd_mmkv/SIM_B`, '{"kept":"ye');
        expect(await backend.get()).toEqual({ kept: "yes" });
        expect(stored("SIM_B", ".damaged")).toBe('{"kept":"ye');
        expect(stored("SIM_B")).toBe('{"kept":"yes"}');
    });

    test("a file that isn't an object, or is damaged with no copy, reads as the defaults and is left alone", async () => {
        for (const [name, text] of [["SIM_C", "5"], ["SIM_D", "\"text\""], ["SIM_E", "null"], ["SIM_F", "{broken"]] as const) {
            files.set(`${DOCS}/vd_mmkv/${name}`, text);
            const backend = storage.createMMKVBackend(name, { d: 1 });
            expect(await backend.get()).toEqual({ d: 1 });
            expect(stored(name)).toBe(text);
        }
        expect(stored("SIM_F", ".damaged")).toBe("{broken");
    });

    test("the storage Endcord's plugins use resolves whatever the file holds", async () => {
        for (const [name, text] of [["SIM_G", "7"], ["SIM_H", "[1,2]"], ["SIM_I", '{"__proto__":{"polluted":1},"ok":true}'], ["SIM_J", ""]] as const) {
            files.set(`${DOCS}/vd_mmkv/${name}`, text);
            const proxy = storage.wrapSync(storage.createStorage(storage.createMMKVBackend(name, {})));
            await storage.awaitStorage(proxy);
        }
        expect(({} as any).polluted).toBeUndefined();
    });
});

describe(`the boot guard on ${SIM}`, () => {
    const record = () => JSON.parse(stored("ENDCORD_BOOT_GUARD") ?? "{}");

    test("three starts that don't come up, then safe mode; one that comes up clears it", async () => {
        const starts: boolean[] = [];
        for (let i = 0; i < 4; i++) {
            const guard = await import(`${SRC}core/debug/bootGuard.ts?${SIM}-crash-${i}`);
            starts.push((await guard.startBootGuard(() => false)).safeModeFromCrashes);
        }
        expect(starts).toEqual([false, false, false, true]);
        expect(record().pending).toBe(4);

        // The safe start comes up: the person leaves the app the normal way
        const guard = await import(`${SRC}core/debug/bootGuard.ts?${SIM}-good`);
        await guard.startBootGuard(() => true);
        guard.watchForStableStart(() => null);
        appState.at(-1)!("background");
        await guard.confirmStart(null);
        expect(record()).toEqual({ pending: 0, lastGood: [] });
        // The loader is told, whether or not it knows the method: neither stops the start
        expect(loaderCalls.at(-1)).toBe("endcord.bundle.confirm");
    });

    test("the loader's answer, as each loader gives it", () => {
        if (ios) {
            expect(() => modules.callLoaderMethod("endcord.security.status")).toThrow("No method endcord.security.status");
        } else {
            expect(modules.callLoaderMethod("endcord.bundle.confirm")).toBe(true);
            expect(() => modules.callLoaderMethod("endcord.security.status")).toThrow("Unknown method");
        }
    });

    test("a reload that was asked for is saved as a good start before Discord reloads", async () => {
        const guard = await import(`${SRC}core/debug/bootGuard.ts?${SIM}-reload`);
        await guard.startBootGuard(() => false);
        expect(record().pending).toBe(1);
        guard.watchForStableStart(() => ["plugin"]);

        // Straight away, as a plugin that reloads when it starts would: not a good start
        events.length = 0;
        modules.BundleUpdaterManager.reload();
        await new Promise(r => setTimeout(r, 20));
        expect(events).toEqual(["native reload"]);
        expect(record().pending).toBe(1);

        // Later, from a button
        const now = Date.now;
        Date.now = () => now() + guard.DELIBERATE_RELOAD_AFTER + 1;
        try {
            events.length = 0;
            const write = fileModule.writeFile;
            fileModule.writeFile = async (...args: any[]) => {
                const result = await write(...args);
                events.push("record saved");
                return result;
            };
            modules.BundleUpdaterManager.reload();
            expect(events).toEqual([]);
            await new Promise(r => setTimeout(r, 50));
            fileModule.writeFile = write;
        } finally {
            Date.now = now;
        }
        expect(events.at(-1)).toBe("native reload");
        expect(events).toContain("record saved");
        expect(record().pending).toBe(0);
    });

    test("a reload still happens when saving hangs", async () => {
        const guard = await import(`${SRC}core/debug/bootGuard.ts?${SIM}-hang`);
        await guard.startBootGuard(() => false);
        guard.watchForStableStart(() => []);
        const now = Date.now;
        const write = fileModule.writeFile;
        Date.now = () => now() + guard.DELIBERATE_RELOAD_AFTER + 1;
        fileModule.writeFile = () => new Promise(() => { });
        events.length = 0;
        try {
            modules.BundleUpdaterManager.reload();
            await new Promise(r => setTimeout(r, 1700));
        } finally {
            Date.now = now;
            fileModule.writeFile = write;
        }
        expect(events).toEqual(["native reload"]);
    }, 5000);
});
