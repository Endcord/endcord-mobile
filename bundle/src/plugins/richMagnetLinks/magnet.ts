/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Magnet links in a message and the name of the file each is for, as Endcord PC's RichMagnetLinks reads them.
 */

/** The longest name shown; it's someone else's text */
const MAX_NAME = 120;
/** The longest message looked at: Discord's own limit for Nitro */
const MAX_CONTENT = 4000;

// PC's /^magnet:\?[\w\W]+?(?=\s|$)/: everything up to the next space
const MAGNET = /magnet:\?\S+/g;

/** Characters that would break the line or turn the text around: control characters and direction marks */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** The magnet links in a message, in order, each once */
export function magnetLinks(content: unknown): string[] {
    if (typeof content !== "string" || !content.includes("magnet:?")) return [];
    return [...new Set(content.slice(0, MAX_CONTENT).match(MAGNET) ?? [])];
}

/** The file name a magnet link gives (its dn), as text that's safe to show, or undefined when it has none */
export function magnetName(link: string): string | undefined {
    const query = link.slice(link.indexOf("?") + 1);
    for (const pair of query.split("&")) {
        const at = pair.indexOf("=");
        if (at === -1 || pair.slice(0, at).toLowerCase() !== "dn") continue;
        let name: string;
        try {
            name = decodeURIComponent(pair.slice(at + 1).replace(/\+/g, " "));
        } catch {
            // Not valid percent-encoding: shown as written
            name = pair.slice(at + 1).replace(/\+/g, " ");
        }
        name = name.replace(UNSAFE, " ").replace(/\s+/g, " ").trim();
        if (!name) return undefined;
        return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name;
    }
    return undefined;
}

/** The text with each magnet link shown as 🧲 and its file's name */
export function shortenMagnets(text: string, unknown: string): string {
    if (!text.includes("magnet:?")) return text;
    return text.replace(MAGNET, link => `🧲 ${magnetName(link) ?? unknown}`);
}

/** Nodes whose text isn't the message's own words: links, mentions and channels keep theirs */
const isLinkOrMention = (node: any) => node.target != null || node.url != null || node.userId != null || node.channelId != null || node.roleId != null
    || /link|mention|channel|url/i.test(String(node.type ?? ""));

/** Changes the plain text of a row's content nodes, wherever it is in them */
export function mapText(nodes: any[], fn: (text: string) => string): any[] {
    let changed = false;
    const out = nodes.map(node => {
        if (!node || typeof node !== "object") return node;
        if (node.type === "text" && typeof node.content === "string") {
            const content = fn(node.content);
            if (content === node.content) return node;
            changed = true;
            return { ...node, content };
        }
        if (Array.isArray(node.content) && !isLinkOrMention(node)) {
            const content = mapText(node.content, fn);
            if (content === node.content) return node;
            changed = true;
            return { ...node, content };
        }
        return node;
    });
    return changed ? out : nodes;
}
