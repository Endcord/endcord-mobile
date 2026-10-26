// @ts-nocheck
/**
 * node scripts/analyze.mjs: what the minified bundle is made of, and how much of it runs when Discord starts.
 *
 * Modules reached from the entry through static imports run at startup; ones only reached through require() or
 * import() inside functions (plugin code, translations, settings pages, DevTools) run when first used.
 */
import { buildBundle } from "./build.mjs";

const { result } = await buildBundle({ minify: true, outfile: "dist/analyze.js", metafile: true }, true);
const { inputs, outputs } = result.metafile;
const output = Object.values(outputs)[0];
const size = file => output.inputs[file]?.bytesInOutput ?? 0;
const kb = n => `${(n / 1024).toFixed(1)} KB`;

// Startup: the entry, then what index.ts (which the entry requires right away) imports, transitively
const eager = new Set();
const queue = ["src/entry.ts", "src/index.ts", "src/metro/internals/caches.ts"];
while (queue.length) {
    const file = queue.pop();
    if (!file || eager.has(file) || !inputs[file]) continue;
    eager.add(file);
    for (const imp of inputs[file].imports) {
        if (imp.kind === "import-statement" && !imp.external) queue.push(imp.path);
    }
}

const total = output.bytes;
const eagerBytes = [...eager].reduce((n, f) => n + size(f), 0);
console.log(`bundle ${kb(total)}; runs at startup ${kb(eagerBytes)}; loaded when used ${kb(total - eagerBytes)}\n`);

const group = file => file.replace(/^src\//, "").split("/").slice(0, file.includes("plugins/") || file.includes("i18n/") ? 2 : 3).join("/");
const by = files => {
    const out = {};
    for (const f of files) out[group(f)] = (out[group(f)] ?? 0) + size(f);
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
};
console.log("runs at startup:");
for (const [f, b] of by(eager).slice(0, 25)) console.log(`  ${kb(b).padStart(9)}  ${f}`);
console.log("\nloaded when used:");
for (const [f, b] of by(Object.keys(output.inputs).filter(f => !eager.has(f))).slice(0, 25)) console.log(`  ${kb(b).padStart(9)}  ${f}`);
