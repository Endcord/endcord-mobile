#!/usr/bin/env node
/*
 * Keeps Endcord mobile's translation tables in Endcord/i18n/core in sync with the code.
 *
 *   node scripts/i18n-sync.js [--pc <path to Endcord PC's src/utils/i18n.ts>] [--prune]
 *
 * 1. Collects every English string passed to I18n.t / I18n.format / tr(...) in the core, plus
 *    Endcord/i18n/extra-keys.json for keys built at runtime.
 * 2. Merges the per-batch translation files in Endcord/i18n/batches/*.json.
 * 3. Fills keys that are still missing from Endcord PC's translations (downloaded from GitHub when
 *    --pc isn't given), so both clients use the same wording.
 * 4. Reports the keys that still have no translation. Existing translations are never overwritten.
 *
 * --prune removes keys that are no longer used anywhere.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const root = path.resolve(__dirname, "..");
const i18nDir = path.join(root, "Endcord", "i18n");
const srcDir = path.join(root, "Endcord", "src", "main", "java");
const LANGS = ["tr", "ru", "es", "fr"];
const PC_URL = "https://raw.githubusercontent.com/rootpoii/endcord/main/src/utils/i18n.ts";

const args = process.argv.slice(2);
const pcPath = args.includes("--pc") ? args[args.indexOf("--pc") + 1] : null;
const prune = args.includes("--prune");

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p, out);
        else if (/\.(kt|java)$/.test(entry.name)) out.push(p);
    }
    return out;
}

// A Kotlin/Java string literal, without templates
const LIT = String.raw`"((?:[^"\\$]|\\.)*)"`;
const CALL = new RegExp(String.raw`(?:I18n\.t|I18n\.format|\btr)\(\s*${LIT}`, "g");

function unescape(s) {
    return JSON.parse('"' + s.replace(/\\\$/g, "$").replace(/\\'/g, "'") + '"');
}

function collectKeys() {
    const keys = new Set();
    for (const file of walk(srcDir)) {
        const src = fs.readFileSync(file, "utf8");
        for (const m of src.matchAll(CALL)) keys.add(unescape(m[1]));
    }
    const extra = path.join(i18nDir, "extra-keys.json");
    if (fs.existsSync(extra)) for (const k of JSON.parse(fs.readFileSync(extra, "utf8"))) keys.add(k);
    return keys;
}

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            let data = "";
            res.setEncoding("utf8");
            res.on("data", c => data += c);
            res.on("end", () => resolve(data));
        }).on("error", reject);
    });
}

/** Reads the core translation tables out of Endcord PC's i18n.ts without evaluating it. */
function parsePcTables(source) {
    const STR = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|` + "`(?:[^`\\\\]|\\\\.)*`";
    const lineRe = new RegExp(String.raw`^\s*(${STR}|[A-Za-z_$][\w$]*)\s*:\s*(${STR})\s*,?\s*(//.*)?$`);
    const unq = s => {
        if (/^[A-Za-z_$]/.test(s)) return s;
        let body = s.slice(1, -1);
        if (s[0] === "'") body = body.replace(/\\'/g, "'").replace(/"/g, '\\"');
        if (s[0] === "`") body = body.replace(/\\`/g, "`").replace(/"/g, '\\"');
        return JSON.parse('"' + body + '"');
    };
    const tables = {};
    let inCore = false, lang = null;
    for (const line of source.split("\n")) {
        if (line.startsWith("const buildDict")) { inCore = true; continue; }
        if (!inCore) continue;
        if (/^\}\);/.test(line)) break;
        const lm = line.match(/^    (tr|ru|es|fr): \(\) => \(\{/);
        if (lm) { lang = lm[1]; tables[lang] = {}; continue; }
        if (/^    \}\),?$/.test(line)) { lang = null; continue; }
        if (!lang) continue;
        const m = line.match(lineRe);
        if (m) tables[lang][unq(m[1])] = unq(m[2]);
    }
    return tables;
}

function readJson(file, fallback) {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function writeSorted(file, obj) {
    const sorted = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
    fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n");
}

(async () => {
    const keys = collectKeys();
    const tables = Object.fromEntries(LANGS.map(l => [l, readJson(path.join(i18nDir, "core", `${l}.json`), {})]));

    // Batch files: { "English": { "tr": "...", ... } }
    const batchDir = path.join(i18nDir, "batches");
    if (fs.existsSync(batchDir)) {
        for (const f of fs.readdirSync(batchDir).filter(f => f.endsWith(".json")).sort()) {
            const batch = readJson(path.join(batchDir, f), {});
            for (const [en, byLang] of Object.entries(batch)) {
                keys.add(en);
                for (const l of LANGS) if (byLang[l] && !tables[l][en]) tables[l][en] = byLang[l];
            }
        }
    }

    let pc;
    try {
        pc = parsePcTables(pcPath ? fs.readFileSync(pcPath, "utf8") : await fetch(PC_URL));
    } catch (e) {
        console.warn(`Could not load Endcord PC translations (${e.message}), skipping that step`);
        pc = {};
    }

    const missing = Object.fromEntries(LANGS.map(l => [l, []]));
    for (const l of LANGS) {
        for (const key of keys) {
            if (tables[l][key]) continue;
            if (pc[l] && pc[l][key]) tables[l][key] = pc[l][key];
            else missing[l].push(key);
        }
        if (prune) for (const key of Object.keys(tables[l])) if (!keys.has(key)) delete tables[l][key];
        writeSorted(path.join(i18nDir, "core", `${l}.json`), tables[l]);
    }

    console.log(`${keys.size} strings in use`);
    for (const l of LANGS) {
        console.log(`${l}: ${Object.keys(tables[l]).length} translated, ${missing[l].length} missing`);
        for (const k of missing[l]) console.log(`  - ${JSON.stringify(k)}`);
    }
    process.exitCode = LANGS.some(l => missing[l].length) ? 1 : 0;
})();
