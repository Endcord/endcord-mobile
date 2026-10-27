/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onMessageRow, RowOrder } from "../hooks";
import { cached } from "../shared/rows";

const DEFAULT_TONES: Record<string, string> = {
    j: tx("joking"), hj: tx("half-joking"), s: tx("sarcastic"), srs: tx("serious"), lh: tx("light-hearted"), g: tx("genuine"),
    gen: tx("genuine"), gq: tx("genuine question"), pos: tx("positive"), neg: tx("negative"), p: tx("platonic"), r: tx("romantic"),
    t: tx("teasing"), nm: tx("not mad"), lu: tx("a little upset"), nbh: tx("nobody here"), nsrs: tx("not serious"), rh: tx("rhetorical"),
    rt: tx("rhetorical"), ref: tx("reference"), m: tx("metaphorically"), li: tx("literally"), hyp: tx("hyperbole"), th: tx("threat"),
};

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The tones and the pattern that finds them, from the prefix and custom indicators settings */
function compileTones(key: string) {
    const [prefix, customText]: [string, string] = JSON.parse(key);
    const custom = Object.fromEntries(customText.split(";").map(p => p.split("=").map(s => s.trim())).filter(p => p[0] && p[1]).map(([k, v]) => [k.toLowerCase(), v]));
    const tones: Record<string, string> = { ...DEFAULT_TONES, ...custom };
    const re = new RegExp(`(^|\\s)${escapeRegex(prefix)}(${Object.keys(tones).map(escapeRegex).join("|")})(?=$|[\\s.,!?])`, "gi");
    return { tones, re };
}

function annotateTones(nodes: any[], tones: Record<string, string>, re: RegExp): any[] {
    return nodes.map(node => {
        if (node?.type === "text" && typeof node.content === "string") {
            const content = node.content.replace(re, (m: string, space: string, tone: string) => `${m} (${t(tones[tone.toLowerCase()])})`);
            return content === node.content ? node : { ...node, content };
        }
        if (Array.isArray(node?.content)) return { ...node, content: annotateTones(node.content, tones, re) };
        return node;
    });
}

export default definePlugin({
    id: "endcord.tone-indicators",
    name: "ToneIndicators",
    description: tx("Explains tone indicators like /srs and /gen next to them in messages"),
    tags: ["Chat"],
    settings: {
        prefix: { type: "string", label: tx("Prefix"), description: tx("Prefix character(s) for tone indicators."), default: "/" },
        customIndicators: { type: "string", label: tx("Custom indicators"), description: tx("Custom tone indicators (format: jk=Joking; srs=Serious)"), default: "" },
    },
    start({ store, cleanup }) {
        const compiled = cached(compileTones);
        cleanup(onMessageRow("tone-indicators", row => {
            if (!Array.isArray(row.content) || !store.prefix) return;
            const { tones, re } = compiled(JSON.stringify([store.prefix, store.customIndicators]));
            row.content = annotateTones(row.content, tones, re);
        }, RowOrder.ADJUST));
    },
});
