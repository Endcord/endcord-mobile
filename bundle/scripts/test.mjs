// @ts-nocheck
/* eslint-disable no-restricted-syntax */
/**
 * Runs the bundle's tests in test/, each file in a bun process of its own: bun's mock.module() replaces a module for the
 * whole process, so one file's fakes would otherwise leak into the next. The phone simulation runs once per phone.
 *
 *   node scripts/test.mjs [name filter]
 */
import { spawnSync } from "child_process";
import { readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filter = process.argv[2];

const runs = [];
for (const file of readdirSync(path.join(root, "test")).filter(name => name.endsWith(".test.ts")).sort()) {
    if (filter && !file.includes(filter)) continue;
    // Endcord's storage, boot guard and loader bridge against Discord's file module on Android and both kinds of iOS
    if (file === "device.test.ts") for (const sim of ["android", "ios-new", "ios-old"]) runs.push({ file, env: { SIM: sim }, label: `${file} (${sim})` });
    else runs.push({ file, env: {}, label: file });
}

let failed = 0;
for (const run of runs) {
    // Through the shell, which finds bun however it was installed (bun.cmd from npm on Windows). The file names come
    // from test/ and are plain
    const result = spawnSync(`bun test ./test/${run.file}`, {
        cwd: root,
        env: { ...process.env, ...run.env },
        encoding: "utf8",
        shell: true,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const summary = output.match(/^\s*(\d+) pass\s*$/m)?.[1] ?? "?";
    const failures = output.match(/^\s*(\d+) fail\s*$/m)?.[1] ?? (result.status === 0 ? "0" : "?");
    const ok = result.status === 0;
    console.log(`${ok ? "✔" : "✘"} ${run.label}: ${summary} pass, ${failures} fail`);
    if (!ok) {
        failed++;
        console.log(output.split("\n").filter(line => /\(fail\)|error:|Error|expect\(/.test(line)).slice(0, 40).join("\n"));
    }
}
console.log(failed ? `\n${failed} of ${runs.length} test files failed` : `\nAll ${runs.length} test runs passed`);
process.exit(failed ? 1 : 0);
