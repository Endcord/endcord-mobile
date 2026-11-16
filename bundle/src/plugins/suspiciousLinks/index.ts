/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's SuspiciousLinks: a warning under a message whose link only pretends to be a site like Discord or Steam.
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onMessageRow, RowOrder, textNode } from "../hooks";
import { checkMessage, type Warning } from "./detect";

function describe(w: Warning) {
    switch (w.kind) {
        case "lookalike": return t("{host} looks like {real}, but it's a different site.", { host: w.host, real: w.real });
        case "bait": return t("{host} uses the name of {real}, but it isn't {real}.", { host: w.host, real: w.real });
        case "alphabets": return w.real
            ? t("{host} is spelled with letters from another alphabet to look like {real}.", { host: w.host, real: w.real })
            : t("{host} mixes letters from different alphabets, a common way to fake a site's name.", { host: w.host });
        case "hidden": return t("The link says {shown} but goes to {host}.", { host: w.host, shown: w.shown });
        case "userinfo": return t("The link starts with {shown} but goes to {host}.", { host: w.host, shown: w.shown });
    }
}

const cache = new Map<string, Warning[]>();

function warningsFor(content: string) {
    let warnings = cache.get(content);
    if (!warnings) {
        warnings = checkMessage(content);
        if (cache.size > 500) cache.clear();
        cache.set(content, warnings);
    }
    return warnings;
}

export default definePlugin({
    id: "endcord.suspicious-links",
    name: "SuspiciousLinks",
    description: tx("Warns you under a message when a link in it only pretends to be a site like Discord or Steam: look-alike names, letters from other alphabets and links that hide where they go. Nothing is looked up online."),
    icon: "ShieldIcon",
    tags: ["Privacy", "Chat"],
    start({ cleanup }) {
        cleanup(
            onMessageRow("suspicious-links", (row, message) => {
                const content = message?.content;
                if (typeof content !== "string" || !content.includes("http") || !Array.isArray(row.content)) return;
                const warnings = warningsFor(content);
                if (!warnings.length) return;
                row.content = [...row.content, textNode(`\n${warnings.map(w => `⚠️ ${describe(w)}`).join("\n")}`)];
            }, RowOrder.ADD),
            () => cache.clear(),
        );
    },
});
