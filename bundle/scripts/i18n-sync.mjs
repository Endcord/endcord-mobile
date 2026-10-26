// @ts-nocheck
/* eslint-disable no-restricted-syntax */
/**
 * Builds src/core/i18n/locales/<lang>.json, the translations to read and review, and src/core/i18n/compiled/<lang>.json,
 * what ships in the bundle: the same translations keyed by a short hash of the English text, so the English isn't
 * repeated in every language and only the language in use is loaded.
 *
 * Every user-visible string is English text: the values of src/core/i18n/default.json, and every literal passed to
 * t() or tx() anywhere in src/. Each one is translated from, in order:
 *   1. src/core/i18n/overrides.json, for wording that is specific to mobile
 *   2. Endcord PC's translation tables (src/utils/i18n.ts in the Endcord repository), so both clients say the same
 *   3. Endcord PC's plugin description tables, matched through the plugin's English description
 *
 *   node scripts/i18n-sync.mjs [--pc ../../endcord-pc] [--strict]
 *
 * --strict exits with an error when a string has no translation, which is how CI keeps the five languages complete.
 * Without --pc (or when the Endcord PC checkout isn't there), the translations already in locales/ are kept for strings
 * that overrides.json doesn't cover, so the script also works on a machine that only has this repository.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import yargs from "yargs-parser";

const LANGS = ["tr", "ru", "es", "fr"];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const i18nDir = path.join(root, "src/core/i18n");
const args = yargs(process.argv.slice(2));
const pcRoot = path.resolve(root, args.pc ?? "../../endcord-pc");

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
    }
    return out;
}

function unescape(raw) {
    return JSON.parse(`"${raw.replace(/\\'/g, "'").replace(/\\`/g, "`").replace(/(^|[^\\])"/g, "$1\\\"")}"`);
}

// 1. The strings the bundle uses
const defaults = JSON.parse(readFileSync(path.join(i18nDir, "default.json"), "utf8"));
const needed = new Set(Object.values(defaults));
const callRe = /\bt[x]?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
for (const file of walk(path.join(root, "src"))) {
    const code = readFileSync(file, "utf8");
    for (const m of code.matchAll(callRe)) {
        if (m[1] === "`" && m[2].includes("${")) {
            console.warn(`! ${path.relative(root, file)}: t() with a template literal can't be translated: ${m[2]}`);
            continue;
        }
        needed.add(unescape(m[2]));
    }
}
needed.delete(", ");

// 2. Endcord PC's tables
function evalObjectAfter(source, marker) {
    const start = source.indexOf(marker);
    if (start === -1) throw new Error(`Couldn't find '${marker}' in Endcord PC's i18n.ts`);
    const open = source.indexOf("({", start);
    let depth = 0, inStr = null, i = open;
    for (; i < source.length; i++) {
        const c = source[i];
        if (inStr) {
            if (c === "\\") i++;
            else if (c === inStr) inStr = null;
            continue;
        }
        if (c === "/" && source[i + 1] === "/") { i = source.indexOf("\n", i); continue; }
        if (c === "\"" || c === "'" || c === "`") inStr = c;
        else if (c === "(" || c === "{") depth++;
        else if (c === ")" || c === "}") { if (--depth === 0) break; }
    }
    const tables = vm.runInNewContext(source.slice(open, i + 1));
    return Object.fromEntries(LANGS.map(l => [l, tables[l]()]));
}

let pc = null;
const pcI18n = path.join(pcRoot, "src/utils/i18n.ts");
if (existsSync(pcI18n)) {
    const source = readFileSync(pcI18n, "utf8");
    const dict = evalObjectAfter(source, "const buildDict");
    const pluginDesc = evalObjectAfter(source, "const buildPluginDescDict");

    // English plugin descriptions, read from Endcord PC's plugin definitions
    const descByText = {};
    for (const file of walk(path.join(pcRoot, "src/plugins"))) {
        const code = readFileSync(file, "utf8");
        const name = code.match(/definePlugin\(\{\s*name:\s*"([^"]+)"/)?.[1];
        const desc = code.match(/definePlugin\(\{[\s\S]*?\n\s{4}description:\s*"((?:\\.|[^"\\])*)"/)?.[1];
        if (name && desc) descByText[unescape(desc)] = name;
    }
    pc = { dict, pluginDesc, descByText };
    console.log(`Endcord PC tables: ${Object.keys(dict.tr).length} strings, ${Object.keys(pluginDesc.tr).length} plugin descriptions`);
} else {
    console.log(`Endcord PC not found at ${pcRoot}; keeping the existing translations for strings it would provide`);
}

// The hash the bundle looks translations up by; must match textHash in src/core/i18n/index.ts
function textHash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(36);
}

const hashes = new Map();
for (const text of needed) {
    const h = textHash(text);
    if (hashes.has(h)) {
        console.error(`Hash collision between "${hashes.get(h)}" and "${text}"; change one of them`);
        process.exit(1);
    }
    hashes.set(h, text);
}
mkdirSync(path.join(i18nDir, "compiled"), { recursive: true });

// 3. Build each language
const overrides = JSON.parse(readFileSync(path.join(i18nDir, "overrides.json"), "utf8"));
let missingTotal = 0;
for (const lang of LANGS) {
    const file = path.join(i18nDir, "locales", `${lang}.json`);
    const previous = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    const out = {};
    const missing = [];

    for (const text of [...needed].sort()) {
        const value = overrides[text]?.[lang]
            ?? pc?.dict[lang][text]
            ?? (pc?.descByText[text] && pc.pluginDesc[lang][pc.descByText[text]])
            ?? (pc ? undefined : previous[text]);
        if (value != null) out[text] = value;
        else missing.push(text);
    }

    writeFileSync(file, JSON.stringify(out, null, 4) + "\n");
    writeFileSync(path.join(i18nDir, "compiled", `${lang}.json`), JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [textHash(k), v]))));
    missingTotal += missing.length;
    console.log(`${lang}: ${Object.keys(out).length}/${needed.size} translated`);
    for (const m of missing) console.log(`   missing: ${m}`);
}

const unused = Object.keys(overrides).filter(k => !needed.has(k));
for (const u of unused) console.log(`unused override: ${u}`);

if (args.strict && (missingTotal > 0 || unused.length > 0)) process.exit(1);
