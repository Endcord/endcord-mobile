/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { safeFetch } from "@lib/utils";

import { definePlugin } from "../api";
import { onSend } from "../hooks";

// The ClearURLs project's rules, as on Endcord PC
const RULES_URL = "https://raw.githubusercontent.com/ClearURLs/Rules/master/data.min.json";

interface RuleSet {
    urlPattern: RegExp;
    rules: RegExp[];
    rawRules: RegExp[];
    exceptions: RegExp[];
}

// Used until the full list has downloaded, or if it can't be
const FALLBACK: RuleSet[] = [{
    urlPattern: /.*/,
    rules: [/^utm_\w+$/i, /^fbclid$/i, /^gclid$/i, /^dclid$/i, /^igshid$/i, /^igsh$/i, /^mc_eid$/i, /^yclid$/i, /^_hsenc$/i, /^_hsmi$/i, /^mkt_tok$/i],
    rawRules: [],
    exceptions: [],
}, {
    urlPattern: /^https?:\/\/(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|spotify\.com)/i,
    rules: [/^si$/i, /^feature$/i, /^pp$/i],
    rawRules: [],
    exceptions: [],
}];

let rules: RuleSet[] = FALLBACK;

const plugin = definePlugin({
    id: "endcord.clear-urls",
    name: "ClearURLs",
    description: tx("Automatically removes tracking elements from URLs you send"),
    icon: "LinkIcon",
    tags: ["Privacy", "Utility"],
    start({ cleanup, logger }) {
        loadRules().catch(e => logger.warn("Couldn't download the ClearURLs rules; using the built-in ones", e));
        // After the plugins that rewrite links, so their links are cleaned too; edits go through it as well
        cleanup(onSend("clear-urls", cleanText, 60));
    },
});

async function loadRules() {
    const data = await safeFetch(RULES_URL).then(r => r.json());
    const loaded: RuleSet[] = [];
    for (const provider of Object.values<any>(data?.providers ?? {})) {
        try {
            loaded.push({
                urlPattern: new RegExp(provider.urlPattern, "i"),
                rules: (provider.rules ?? []).map((r: string) => new RegExp(`^${r}$`, "i")),
                rawRules: (provider.rawRules ?? []).map((r: string) => new RegExp(r, "i")),
                exceptions: (provider.exceptions ?? []).map((r: string) => new RegExp(r, "i")),
            });
        } catch {
            // A rule this regex engine can't compile is skipped
        }
    }
    if (loaded.length) rules = loaded;
}

/** Removes tracking parameters, without URL (which React Native only partly implements) */
export function cleanUrl(href: string): string {
    const hashIndex = href.indexOf("#");
    const hash = hashIndex === -1 ? "" : href.slice(hashIndex);
    const withoutHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
    const queryIndex = withoutHash.indexOf("?");
    if (queryIndex === -1) return href;

    let base = withoutHash.slice(0, queryIndex);
    let params = withoutHash.slice(queryIndex + 1).split("&").filter(Boolean);

    for (const set of rules) {
        if (!set.urlPattern.test(href) || set.exceptions.some(e => e.test(href))) continue;
        params = params.filter(p => {
            let name = p.split("=")[0];
            try {
                name = decodeURIComponent(name);
            } catch { }
            return !set.rules.some(r => r.test(name));
        });
        for (const raw of set.rawRules) base = base.replace(raw, "");
    }

    return base + (params.length ? `?${params.join("&")}` : "") + hash;
}

/** The text with every link in it cleaned */
export function cleanText(content: string): string {
    if (!/https?:\/\//.test(content)) return content;
    return content.replace(/(https?:\/\/[^\s<]+[^<.,:;"'>)|\]\s])/g, match => {
        try {
            return cleanUrl(match);
        } catch {
            return match;
        }
    });
}

export default plugin;
