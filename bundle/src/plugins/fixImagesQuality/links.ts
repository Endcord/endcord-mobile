/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FixImagesQuality's pure part: an attached image's link without the size Discord's media proxy was asked to shrink
 * it to, as Endcord PC builds it. Nothing here touches Discord or the network.
 */

export interface ImageInfo {
    width: number;
    height: number;
}

/** The largest picture loaded in chat when the original isn't asked for, Endcord PC's limit */
export const CHAT_PIXEL_LIMIT = 2000 * 1200;

const MAX_URL = 2048;
const PROXIED = /^https:\/\/media\.discordapp\.net\/attachments\/(\d{1,20})\/(\d{1,20})\/([^?#/]+)(?:\?([^#]*))?$/;
const ATTACHMENT = /^https:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\/attachments\/\d{1,20}\/(\d{1,20})\//;
const IMAGE_NAME = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
/** What keeps an attachment's link valid on Discord's CDN */
const SIGNATURE = new Set(["ex", "is", "hm"]);

const dimension = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n < 100000 ? n : 0;
};

/** A message's attached pictures (and pictures linked from Discord's CDN in its embeds), by attachment ID */
export function imagesOf(message: any): Map<string, ImageInfo> {
    const images = new Map<string, ImageInfo>();
    for (const a of Array.isArray(message?.attachments) ? message.attachments.slice(0, 50) : []) {
        const type = String(a?.content_type ?? a?.contentType ?? "");
        const image = type ? type.startsWith("image/") : IMAGE_NAME.test(String(a?.filename ?? ""));
        if (!image || typeof a.id !== "string") continue;
        images.set(a.id, { width: dimension(a.width), height: dimension(a.height) });
    }
    for (const e of Array.isArray(message?.embeds) ? message.embeds.slice(0, 20) : []) {
        for (const picture of [e?.image, e?.thumbnail]) {
            const link = picture?.proxy_url ?? picture?.proxyURL ?? picture?.url;
            const id = typeof link === "string" ? ATTACHMENT.exec(link)?.[1] : undefined;
            if (id && !images.has(id)) images.set(id, { width: dimension(picture.width), height: dimension(picture.height) });
        }
    }
    return images;
}

/** The attachment a link of Discord's media proxy shows, or undefined for any other link */
export function proxiedAttachmentId(link: string): string | undefined {
    return link.length <= MAX_URL ? PROXIED.exec(link)?.[2] : undefined;
}

/**
 * The link at full resolution: Discord's optimized copy without the size it was shrunk to (larger pictures are kept
 * to CHAT_PIXEL_LIMIT), or with `original` the file itself from Discord's CDN
 */
export function fullResolution(link: string, info: ImageInfo | undefined, original: boolean): string {
    const match = link.length <= MAX_URL ? PROXIED.exec(link) : null;
    if (!match) return link;
    const [, channel, attachment, file, query = ""] = match;
    const params = query.split("&").filter(Boolean);
    const key = (pair: string) => pair.split("=")[0];
    if (original) {
        const kept = params.filter(p => SIGNATURE.has(key(p)));
        return `https://cdn.discordapp.com/attachments/${channel}/${attachment}/${file}${kept.length ? `?${kept.join("&")}` : ""}`;
    }
    const kept = params.filter(p => key(p) !== "width" && key(p) !== "height");
    const width = info?.width ?? 0, height = info?.height ?? 0;
    if (width && height && width * height > CHAT_PIXEL_LIMIT) {
        const scale = Math.sqrt(width * height / CHAT_PIXEL_LIMIT);
        kept.push(`width=${Math.round(width / scale)}`, `height=${Math.round(height / scale)}`);
    }
    return `https://media.discordapp.net/attachments/${channel}/${attachment}/${file}${kept.length ? `?${kept.join("&")}` : ""}`;
}

const isPlain = (value: unknown): value is Record<string, unknown> | unknown[] => {
    if (Array.isArray(value)) return true;
    if (!value || typeof value !== "object") return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
};

/**
 * The same data with its strings mapped, copied only along what changed so nothing Discord keeps elsewhere is
 * changed under it. Looks at most `budget` values, `depth` levels down.
 */
export function mapStrings<T>(node: T, fn: (text: string) => string, budget = { left: 400 }, depth = 6): T {
    if (!isPlain(node) || depth < 0) return node;
    let copy: any;
    const entries: Array<[string | number, unknown]> = Array.isArray(node) ? node.map((v, i) => [i, v]) : Object.entries(node);
    for (const [key, value] of entries) {
        if (--budget.left < 0) break;
        if (key === "__proto__") continue;
        const next = typeof value === "string" ? fn(value) : mapStrings(value, fn, budget, depth - 1);
        if (next === value) continue;
        copy ??= Array.isArray(node) ? [...node] : { ...node };
        copy[key] = next;
    }
    return copy ?? node;
}
