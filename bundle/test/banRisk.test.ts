// The ban-risk warnings name real plugins: a plugin renamed without its warning would lose it silently
import { expect, mock, test } from "bun:test";

import { SRC } from "./src";

mock.module(SRC + "core/i18n/index.ts", () => ({ t: (s: string) => s, tx: (s: string) => s }));

const { BAN_RISK, banRiskOf } = await import(SRC + "plugins/banRisk.ts");
const { manifest } = await import(SRC + "plugins/manifest.ts");

test("every plugin with a warning is one of Endcord's plugins", () => {
    const names = new Set(manifest.map((p: { name: string; }) => p.name));
    for (const name of Object.keys(BAN_RISK)) expect(names.has(name)).toBe(true);
});

test("only Endcord's own plugins get the warning, by their exact name", () => {
    expect(banRiskOf({ name: "AutoReact", endcord: true })).toBe(BAN_RISK.AutoReact);
    expect(banRiskOf({ name: "AutoReact" })).toBeUndefined();
    expect(banRiskOf({ name: "autoreact", endcord: true })).toBeUndefined();
    expect(banRiskOf({ name: "toString", endcord: true })).toBeUndefined();
    expect(banRiskOf({ name: "__proto__", endcord: true })).toBeUndefined();
});
