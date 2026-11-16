/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MoreStickers' pure part: a LINE sticker or emoji pack read from its store page, as Endcord PC reads it, without a
 * DOM: the page's tags that carry a sticker's data-preview, the pack's title. The page is someone else's, so it is
 * capped, read without patterns that can take long, and only pictures on LINE's sticker servers are kept.
 */

export interface Sticker {
    id: string;
    image: string;
}

export interface StickerPack {
    /** line:sticker:<id> or line:emoji:<id> */
    id: string;
    title: string;
    logo: string;
    stickers: Sticker[];
}

export type PackKind = "sticker" | "emoji";

export const MAX_PAGE = 3 * 1024 * 1024;
export const MAX_STICKERS = 200;
const MAX_TAGS = 2000;
const MAX_URL = 2048;

/** The pack a LINE store link is for, like https://store.line.me/stickershop/product/1234/en */
export function parsePackUrl(text: string): { kind: PackKind; id: string; } | undefined {
    const match = /^https:\/\/store\.line\.me\/(stickershop|emojishop)\/product\/([a-z0-9]{1,40})(?:[/?#]|$)/i.exec(text.trim());
    if (!match) return;
    return { kind: match[1].toLowerCase() === "emojishop" ? "emoji" : "sticker", id: match[2] };
}

/** The store page Endcord reads a pack from: built here, never the link as typed */
export const storeUrl = (kind: PackKind, id: string) => `https://store.line.me/${kind === "emoji" ? "emojishop" : "stickershop"}/product/${encodeURIComponent(id)}/en`;

const ENTITIES: Record<string, string> = { quot: "\"", amp: "&", apos: "'", lt: "<", gt: ">", nbsp: " " };

/** HTML's character references, as an attribute's value or a text has them */
export function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (whole, name: string) => {
        if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    });
}

/** A picture on LINE's sticker servers */
export function isLineImage(url: unknown): url is string {
    if (typeof url !== "string" || url.length > MAX_URL || /[\s\0-\x1f\x7f"'<>\\]/.test(url)) return false;
    const host = /^https:\/\/([a-z0-9.-]+)\//i.exec(url)?.[1]?.toLowerCase();
    return !!host && (host === "line-scdn.net" || host.endsWith(".line-scdn.net"));
}

function attribute(tag: string, name: string): string | undefined {
    const at = tag.indexOf(` ${name}=`);
    if (at === -1) return;
    const start = at + name.length + 2;
    const quote = tag[start];
    if (quote === "\"" || quote === "'") {
        const end = tag.indexOf(quote, start + 1);
        return end === -1 ? undefined : decodeEntities(tag.slice(start + 1, end));
    }
    return tag.slice(start).split(/[\s>]/)[0];
}

function preview(tag: string): { id: string; image: string; } | undefined {
    const raw = attribute(tag, "data-preview");
    if (!raw || raw.length > 10000) return;
    let data: any;
    try {
        data = JSON.parse(raw);
    } catch {
        return;
    }
    const id = typeof data?.id === "string" || typeof data?.id === "number" ? String(data.id) : "";
    if (!/^[a-z0-9_-]{1,40}$/i.test(id)) return;
    const image = [data.animationUrl, data.staticUrl, data.fallbackStaticUrl].find(isLineImage);
    return image ? { id, image } : undefined;
}

/** The text of the first element whose data-test is `test` */
function textOf(html: string, test: string): string | undefined {
    const at = html.indexOf(`data-test="${test}"`);
    if (at === -1) return;
    const open = html.indexOf(">", at);
    const close = open === -1 ? -1 : html.indexOf("<", open);
    if (close === -1 || close - open > 1000) return;
    const text = decodeEntities(html.slice(open + 1, close)).replace(/\s+/g, " ").trim();
    return text || undefined;
}

/** A pack from its store page's HTML; throws when the page isn't one */
export function parsePackPage(html: string, kind: PackKind, packId: string): StickerPack {
    if (typeof html !== "string" || html.length > MAX_PAGE) throw new Error("This page is too large to be a sticker pack");
    const itemTest = kind === "emoji" ? null : "sticker-item";
    let logo: string | undefined;
    const stickers: Sticker[] = [];
    const seen = new Set<string>();
    let tags = 0;
    // Every tag, one at a time: a tag can't hold < or >, so this never looks back
    for (const match of html.matchAll(/<[a-z][^<>]{0,4000}>/gi)) {
        const tag = match[0];
        if (!tag.includes("data-preview=")) continue;
        if (++tags > MAX_TAGS) break;
        const item = preview(tag);
        if (!item) continue;
        if (attribute(tag, "ref") === "mainImage") {
            logo ??= item.image;
            continue;
        }
        const isItem = itemTest ? attribute(tag, "data-test") === itemTest : (attribute(tag, "class") ?? "").split(/\s+/).includes("FnStickerPreviewItem");
        if (!isItem || seen.has(item.id) || stickers.length >= MAX_STICKERS) continue;
        seen.add(item.id);
        stickers.push(item);
    }
    if (!stickers.length) throw new Error("No stickers were found on this page");
    const title = textOf(html, kind === "emoji" ? "emoji-name-title" : "sticker-name-title");
    return {
        id: `line:${kind}:${packId}`,
        title: (title ?? packId).slice(0, 100),
        logo: logo ?? stickers[0].image,
        stickers,
    };
}

/** A saved pack, as it was saved: anything else in storage is dropped */
export function isPack(value: any): value is StickerPack {
    return !!value && typeof value.id === "string" && typeof value.title === "string" && isLineImage(value.logo)
        && Array.isArray(value.stickers) && value.stickers.every((s: any) => typeof s?.id === "string" && isLineImage(s.image));
}
