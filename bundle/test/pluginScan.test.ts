// What a community plugin's code is checked for before it's installed or updated
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";
mock.module(SRC + "core/i18n/index.ts", () => ({
    t: (s: string, values?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? `{${k}}`)),
    tx: (s: string) => s,
}));
const alerts: any[] = [];
let alertThrows = false;
mock.module(SRC + "core/vendetta/alerts.ts", () => ({
    showConfirmationAlert: (options: any) => {
        if (alertThrows) throw new Error("no alerts here");
        alerts.push(options);
    },
}));

const { confirmRisks, describeRisk, isSerious, newRisks, scanPluginCode } = await import(SRC + "core/pluginScan.ts");
const kinds = (code: string) => scanPluginCode(code).map(f => f.kind);

describe("the scan", () => {
    test("plain code has nothing", () => {
        expect(scanPluginCode("export default { onLoad() { console.log('hi') } }")).toEqual([]);
        expect(scanPluginCode(undefined as any)).toEqual([]);
    });

    test("each kind", () => {
        expect(kinds("const t = findByProps('getToken').getToken()")).toEqual(["token"]);
        expect(kinds("eval(x)")).toEqual(["dynamicCode"]);
        expect(kinds("new Function('return 1')")).toEqual(["dynamicCode"]);
        expect(kinds("window.evaluate(x); myFunction(1)")).toEqual([]);
        expect(kinds("NativeModules.NativeFileModule.readFile(p)")).toEqual(["files"]);
        expect(kinds(`const s = "${"A".repeat(3000)}"`)).toEqual(["obfuscated"]);
        expect(kinds("\\x41".repeat(300))).toEqual(["obfuscated"]);
        expect(kinds(Array.from({ length: 50 }, (_, i) => `_0x${(0x1000 + i).toString(16)}`).join(" "))).toEqual(["obfuscated"]);
        expect(kinds(`const s = "${"A".repeat(2999)}"`)).toEqual([]);
    });

    test("the other ways to run built code", () => {
        for (const code of ["(0, eval)(x)", "(0,eval)(x)", "globalThis.eval?.(x)", "eval ?.(x)", "Function('return 1')()", "const f = Function(a, b)"]) {
            expect(kinds(code)).toEqual(["dynamicCode"]);
        }
        // How bundled libraries find the global object, and words that only look like it
        for (const code of ["Function(\"return this\")()", "Function('return this')()", "isFunction(x)", "evaluate(x)", "const evaluation = 1"]) {
            expect(kinds(code)).toEqual([]);
        }
    });

    test("all of the code is read, up to the download limit", () => {
        const padded = "/*" + " ".repeat(20 * 1024 * 1024) + "*/ getToken()";
        expect(kinds(padded)).toEqual(["token"]);
        expect(kinds("\\x41".repeat(5_000_000))).toEqual(["obfuscated"]);
    });

    test("network, with the sites named and Discord's own left out", () => {
        const [finding] = scanPluginCode("fetch('https://Evil.example/steal'); fetch('https://cdn.discordapp.com/x'); fetch('https://discord.com/api'); const u = 'https://api.other.example/v1'");
        expect(finding).toEqual({ kind: "network", hosts: ["evil.example", "api.other.example"] });
        expect(isSerious([finding])).toBe(false);
        // Not a site that only ends like Discord's
        expect(scanPluginCode("fetch('https://notdiscord.com/x')")[0].hosts).toEqual(["notdiscord.com"]);
        expect(scanPluginCode("fetch('https://evil.discord.com.example/x')")[0].hosts).toEqual(["evil.discord.com.example"]);
        // At most eight
        expect(scanPluginCode("fetch(); " + Array.from({ length: 20 }, (_, i) => `'https://s${i}.example'`).join(" "))[0].hosts!.length).toBe(8);
    });
});

describe("updates", () => {
    test("only what's new counts", () => {
        const before = scanPluginCode("fetch('https://a.example')");
        const after = scanPluginCode("fetch('https://a.example'); fetch('https://b.example'); getToken()");
        expect(newRisks(before, after)).toEqual([{ kind: "token" }, { kind: "network", hosts: ["b.example"] }]);
        expect(newRisks(after, after)).toEqual([]);
        expect(newRisks(after, before)).toEqual([]);
    });
});

describe("asking", () => {
    test("nothing serious: no question", async () => {
        expect(await confirmRisks("P", scanPluginCode("fetch('https://a.example')"))).toBe(true);
        expect(alerts.length).toBe(0);
    });

    test("serious: the answer decides, and the alert can't be dismissed", async () => {
        const findings = scanPluginCode("getToken(); eval(x)");
        const yes = confirmRisks("Evil", findings);
        expect(alerts[0].isDismissable).toBe(false);
        expect(alerts[0].content).toContain("Evil");
        expect(alerts[0].content).toContain(describeRisk({ kind: "token" }));
        expect(alerts[0].content).toContain(describeRisk({ kind: "dynamicCode" }));
        alerts[0].onConfirm();
        expect(await yes).toBe(true);
        const no = confirmRisks("Evil", findings);
        alerts[1].onCancel();
        expect(await no).toBe(false);
    });

    test("no way to ask: not installed", async () => {
        alertThrows = true;
        expect(await confirmRisks("Evil", scanPluginCode("getToken()"))).toBe(false);
        alertThrows = false;
    });
});
