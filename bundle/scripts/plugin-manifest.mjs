// @ts-nocheck
/**
 * Writes src/plugins/manifest.ts: what the plugin list needs to know about every built-in plugin (name, description,
 * tags...) and how to load each one's code. Endcord starts with only this; a plugin's code is loaded the first time it
 * starts or its settings open, so plugins that are off cost nothing on slower phones.
 *
 *   node scripts/plugin-manifest.mjs [--check]
 *
 * Run by the build, so the manifest can't fall behind the plugins. --check fails when the committed one has.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import ts from "typescript";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/plugins");
const out = path.join(root, "manifest.ts");
const descriptionsOut = path.join(root, "descriptions.json");

const text = node => !node ? undefined : ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;
// tx("...") or a plain string
const message = node => node && (text(node) ?? (ts.isCallExpression(node) && node.expression.getText() === "tx" ? text(node.arguments[0]) : undefined));

// Endcord PC's lint rule for setting names: one that holds a secret has to say so, or a backup would carry it
const SECRET_NAME = /token|secret|passw(?:or)?d|api_?key|auth(?:orization|Key)?$|session_?key|cookie|credential|webhook/i;

const property = (object, name) => object.properties.find(q => ts.isPropertyAssignment(q) && q.name.getText() === name)?.initializer;

// The settings marked sensitive: true, which backups leave out (core/backup.ts)
function sensitiveSettings(settings, where) {
    if (!settings || !ts.isObjectLiteralExpression(settings)) return [];
    const sensitive = [];
    for (const p of settings.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        const key = text(p.name) ?? p.name.getText();
        const marked = property(p.initializer, "sensitive")?.kind === ts.SyntaxKind.TrueKeyword;
        if (marked) sensitive.push(key);
        else if (text(property(p.initializer, "type")) === "string" && SECRET_NAME.test(key)) {
            throw new Error(`${where}: the setting '${key}' looks like it holds a secret; mark it sensitive: true so backups leave it out`);
        }
    }
    return sensitive;
}

function pluginsIn(file) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const found = [];
    const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText() === "definePlugin" && ts.isObjectLiteralExpression(node.arguments[0])) {
            const props = Object.fromEntries(node.arguments[0].properties
                .filter(p => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) || ts.isMethodDeclaration(p)) && p.name)
                .map(p => [p.name.getText(), p]));
            const value = key => props[key] && ts.isPropertyAssignment(props[key]) ? props[key].initializer : undefined;
            const plugin = {
                id: text(value("id")),
                name: text(value("name")),
                description: message(value("description")),
                popular: value("popular") && ts.isNumericLiteral(value("popular")) ? Number(value("popular").text) : undefined,
                icon: text(value("icon")),
                tags: value("tags") && ts.isArrayLiteralExpression(value("tags")) ? value("tags").elements.map(text).filter(Boolean) : [],
                enabledByDefault: value("enabledByDefault")?.kind === ts.SyntaxKind.TrueKeyword,
                hasSettings: !!(props.settings || props.SettingsComponent),
                sensitive: sensitiveSettings(value("settings"), path.relative(root, file)),
            };
            for (const key of ["id", "name", "description"]) {
                if (!plugin[key]) throw new Error(`${path.relative(root, file)}: a plugin's ${key} must be written out as text`);
            }
            found.push(plugin);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
}

// One plugin per folder, like Endcord PC: plugins/<plugin>/index.ts(x). ui/ and shared/ hold what plugins share.
const all = [];
for (const dir of readdirSync(root).sort()) {
    const full = path.join(root, dir);
    if (!statSync(full).isDirectory() || dir === "ui" || dir === "shared") continue;
    const file = readdirSync(full).find(f => /^index\.tsx?$/.test(f));
    if (!file) throw new Error(`plugins/${dir} has no index.ts(x)`);
    const plugins = pluginsIn(path.join(full, file));
    if (plugins.length !== 1) throw new Error(`plugins/${dir}/${file} must define exactly one plugin; it defines ${plugins.length}`);
    all.push({ ...plugins[0], dir });
}
const ids = new Set();
for (const p of all) {
    if (ids.has(p.id)) throw new Error(`Two plugins have the ID ${p.id}`);
    ids.add(p.id);
}

const entry = p => `    { ${[
    `id: ${JSON.stringify(p.id)}`,
    `name: ${JSON.stringify(p.name)}`,
    p.popular != null && `popular: ${p.popular}`,
    p.icon && `icon: ${JSON.stringify(p.icon)}`,
    p.tags.length && `tags: [${p.tags.map(t => JSON.stringify(t)).join(", ")}]`,
    p.enabledByDefault && "enabledByDefault: true",
    p.hasSettings && "hasSettings: true",
    p.sensitive.length && `sensitive: [${p.sensitive.map(k => JSON.stringify(k)).join(", ")}]`,
].filter(Boolean).join(", ")} },`;

const code = `/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Generated by scripts/plugin-manifest.mjs from the plugins' definitions; the build keeps it up to date.
 */

import type { EndcordPlugin, PluginTag } from "./api";

export interface PluginInfo {
    id: string;
    name: string;
    popular?: number;
    icon?: string;
    tags?: PluginTag[];
    enabledByDefault?: boolean;
    hasSettings?: boolean;
    /** Settings that never go in a backup */
    sensitive?: string[];
}

/** Every built-in plugin, without its code; their descriptions are in descriptions.json, loaded for the plugin list */
export const manifest: PluginInfo[] = [
${all.map(entry).join("\n")}
];

/** Loads a plugin's code, by ID; esbuild only runs a module the first time it's required */
export const loaders: Record<string, () => { default: EndcordPlugin; }> = {
${all.map(p => `    ${JSON.stringify(p.id)}: () => require(${JSON.stringify(`./${p.dir}`)}),`).join("\n")}
};
`;

const descriptions = JSON.stringify(Object.fromEntries(all.map(p => [p.id, p.description])), null, 4) + "\n";

const same = (file, text) => {
    try {
        return readFileSync(file, "utf8").replace(/\r\n/g, "\n") === text;
    } catch {
        return false;
    }
};

if (process.argv.includes("--check")) {
    if (!same(out, code) || !same(descriptionsOut, descriptions)) {
        console.error("src/plugins/manifest.ts is out of date; run node scripts/plugin-manifest.mjs");
        process.exit(1);
    }
} else {
    // Only when changed: every build runs this, and rewriting unchanged files made each one look like a source edit
    if (!same(out, code)) writeFileSync(out, code);
    if (!same(descriptionsOut, descriptions)) writeFileSync(descriptionsOut, descriptions);
}
console.log(`${all.length} plugins`);
