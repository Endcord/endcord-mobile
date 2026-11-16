/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Reads a community plugin's code before it first runs, and before new code replaces what's running, for what a
 * plugin rarely needs and a malicious one always does: the account's token, code built at run time, the app's files,
 * code made unreadable on purpose. It can't prove a plugin safe; it says what to look at before trusting it.
 */

import { t } from "@core/i18n";
import { showConfirmationAlert } from "@core/vendetta/alerts";

export type RiskKind = "token" | "dynamicCode" | "files" | "native" | "obfuscated" | "network";

export interface RiskFinding {
    kind: RiskKind;
    /** For network: the sites the code names */
    hosts?: string[];
}

/** What's worth stopping for; the sites a plugin talks to are only listed */
export const SERIOUS: ReadonlySet<RiskKind> = new Set(["token", "dynamicCode", "files", "native", "obfuscated"]);

/** Sites that are Discord's own, which every plugin may reach */
const DISCORD_HOSTS = /(?:^|\.)(?:discord\.com|discordapp\.com|discordapp\.net|discord\.gg|discord\.media)$/i;
const MAX_HOSTS = 8;

/** Whether the pattern, which must have the g flag, matches at least `count` times; stops counting there */
function atLeast(text: string, pattern: RegExp, count: number) {
    pattern.lastIndex = 0;
    let found = 0;
    while (found < count && pattern.exec(text)) found++;
    pattern.lastIndex = 0;
    return found >= count;
}

// eval( and its other spellings, (0, eval)( and eval?.(; Function( with or without new, except the usual way bundled
// libraries find the global object, Function("return this"); and the Function constructor reached through any value's
// constructor, x.constructor.constructor( or x["constructor"]["constructor"](
const DYNAMIC_CODE = /\beval\s*\)?\s*(?:\?\.\s*)?\(|\bFunction\s*\(\s*(?!["']return this["']\s*\))|(?:\.\s*constructor|\[\s*["'`]constructor["'`]\s*\])\s*(?:\.\s*constructor\b|\[\s*["'`]constructor["'`]\s*\])/;
// Discord's native modules reached directly, past the functions Discord and Endcord wrap them in: the file module is
// among them, under a name that can be put together from pieces
const NATIVE_MODULES = /\b(?:nativeModuleProxy|__turboModuleProxy)\b/;

/**
 * What a plugin's code does that plugins rarely need. All of it is read: the download limit (MAX_SIZES.code) is the
 * most there can be. A check like this finds what's written plainly; code can always hide what it does further
 */
export function scanPluginCode(code: string): RiskFinding[] {
    if (typeof code !== "string") return [];
    const text = code;
    const findings: RiskFinding[] = [];

    // Discord's token getter, which plugins reach by its name
    if (/\bgetToken\b/.test(text)) findings.push({ kind: "token" });
    if (DYNAMIC_CODE.test(text)) findings.push({ kind: "dynamicCode" });
    if (/\b(?:NativeFileModule|RTNFileManager|DCDFileManager)\b/.test(text)) findings.push({ kind: "files" });
    if (NATIVE_MODULES.test(text)) findings.push({ kind: "native" });

    // Long runs of encoded text, or names the usual obfuscators give everything
    const longEncoded = /["'`][A-Za-z0-9+/=]{3000,}["'`]/.test(text);
    const hexEscapes = atLeast(text, /\\x[0-9a-f]{2}/gi, 300);
    const mangledNames = atLeast(text, /\b_0x[0-9a-f]{4,}\b/gi, 50);
    if (longEncoded || hexEscapes || mangledNames) findings.push({ kind: "obfuscated" });

    if (/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(/.test(text)) {
        const hosts = new Set<string>();
        for (const m of text.matchAll(/https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
            const host = m[1].toLowerCase();
            if (!DISCORD_HOSTS.test(host)) hosts.add(host);
            if (hosts.size >= MAX_HOSTS) break;
        }
        findings.push({ kind: "network", hosts: [...hosts] });
    }
    return findings;
}

/** What new code does that the code before didn't: new kinds, and sites it didn't name */
export function newRisks(before: RiskFinding[], after: RiskFinding[]): RiskFinding[] {
    const had = new Map(before.map(f => [f.kind, f]));
    const out: RiskFinding[] = [];
    for (const finding of after) {
        const old = had.get(finding.kind);
        if (!old) out.push(finding);
        else if (finding.kind === "network") {
            const known = new Set(old.hosts ?? []);
            const added = (finding.hosts ?? []).filter(h => !known.has(h));
            if (added.length) out.push({ kind: "network", hosts: added });
        }
    }
    return out;
}

export const isSerious = (findings: RiskFinding[]) => findings.some(f => SERIOUS.has(f.kind));

export function describeRisk(finding: RiskFinding): string {
    switch (finding.kind) {
        case "token": return t("Reads your account's token, which lets whoever has it use your account");
        case "dynamicCode": return t("Builds and runs code while it runs, which can't be read beforehand");
        case "files": return t("Reads or writes the app's files directly");
        case "native": return t("Uses the phone's native functions directly, which can read and write the app's files");
        case "obfuscated": return t("Has code made hard to read on purpose");
        case "network": return finding.hosts?.length
            ? t("Talks to these sites: {hosts}", { hosts: finding.hosts.join(", ") })
            : t("Talks to sites on the internet");
    }
}

/**
 * Asks before a plugin with serious findings is installed, listing everything found. Resolves to whether to go on;
 * the alert can only be answered with its buttons, so the install never waits forever
 */
/**
 * A plugin's name as an alert shows it. The name is the plugin's own (its manifest): without control and direction
 * characters, on one line and short, it can't push the risks listed after it out of view or pass for something else
 */
export function plainName(name: unknown): string {
    const text = String(name ?? "")
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
    const chars = [...text];
    return chars.length > 60 ? `${chars.slice(0, 59).join("")}…` : text || "?";
}

export function confirmRisks(name: string, findings: RiskFinding[]): Promise<boolean> {
    if (!isSerious(findings)) return Promise.resolve(true);
    return new Promise(resolve => {
        try {
            showConfirmationAlert({
                title: t("Check this plugin before installing it"),
                content: t("{name} does things a plugin rarely needs and a harmful one always does:\n\n{list}\n\nOnly install it if you trust whoever made it.", {
                    name: plainName(name),
                    list: findings.map(f => `• ${describeRisk(f)}`).join("\n"),
                }),
                confirmText: t("Install anyway"),
                cancelText: t("Cancel"),
                isDismissable: false,
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false),
            });
        } catch (e) {
            // No way to ask: not installed
            console.error("[Endcord] Couldn't ask about the plugin's code", e);
            resolve(false);
        }
    });
}
