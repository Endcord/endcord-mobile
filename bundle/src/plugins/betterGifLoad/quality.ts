/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * BetterGifLoad's pure part: a GIF's link at the quality picked, the way Endcord PC rewrites it. Tenor and Giphy serve
 * each GIF in several sizes under predictable names; Discord's media proxy resizes what it serves. Nothing here
 * touches Discord or the network.
 */

export interface Quality {
    giphy: string;
    tenor: string;
    cap: number;
    video: string;
}

// Endcord PC's table, worked out from the services' links; cap is the largest side in pixels
export const QUALITIES: readonly Quality[] = [
    { giphy: "giphy", tenor: "Ax", cap: 480, video: "Po" }, // High, about 480 or the GIF's own size
    { giphy: "480w", tenor: "A5", cap: 360, video: "P3" }, // Reasonable, about 360
    { giphy: "200", tenor: "A1", cap: 200, video: "P2" }, // Low, about 200
    { giphy: "100", tenor: "A2", cap: 120, video: "P4" }, // Horrible, about 120
];

export const qualityOf = (setting: string) => QUALITIES[Number(setting) - 1] ?? QUALITIES[0];

const MAX_URL = 2048;

const TENOR = /^https:\/\/(?:media\d?|c)\.tenor\.com(?:\/m)?\/([^/?#]+?)(\w{2})\/([^/?#]+)\.(gif|webp|mp4|webm)$/i;
const GIPHY = /^https:\/\/(?:media\d?|i)\.giphy\.com\/media\/(?:[^/?#]+\/)*?([^/?#]+)\/([^/?#]+)\.(gif|webp)(?:\?[^#]*)?$/i;
const DISCORD_HOST = /^https:\/\/((?:[a-z0-9-]+\.)*discordapp\.net|cdn\.discordapp\.com)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i;

/** The link inside one of Discord's links to media it serves for another site */
export function unproxied(link: string): string {
    const match = /^https:\/\/(?:images-ext-\d+|media)\.discordapp\.net\/external\/([^?#]*)/i.exec(link);
    if (!match) return link;
    const parts = match[1].split("/");
    // external/<signature>/[<options>/]<protocol>/<host>/<path>
    const at = parts.findIndex((p, i) => i > 0 && (p === "https" || p === "http"));
    if (at === -1 || at + 1 >= parts.length) return link;
    try {
        return `${parts[at]}://${parts.slice(at + 1).map(p => decodeURIComponent(p)).join("/")}`;
    } catch {
        return link;
    }
}

function setParams(link: string, params: Record<string, string>): string {
    const match = DISCORD_HOST.exec(link);
    if (!match) return link;
    const [, host, path = "/", query = "", hash = ""] = match;
    const kept = query.slice(1).split("&").filter(pair => pair && !Object.prototype.hasOwnProperty.call(params, pair.split("=")[0]));
    const added = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    return `https://${host}${path}?${[...kept, ...added].join("&")}${hash}`;
}

const isVideoPath = (link: string) => /\.(mp4|webm|mov)(?:[?#]|$)/i.test(link);

/** Whether a link is to a video rather than a picture, by its name */
export const isVideoLink = (link: unknown) => typeof link === "string" && isVideoPath(unproxied(link).split("?")[0]);

/**
 * A GIF's link at the quality picked. `asPicture` gives a picture even for a video (the GIF picker's results and
 * categories, as on PC); `size` is the GIF's own width and height, for links Discord resizes.
 */
export function atQuality(link: unknown, quality: Quality, size?: [number, number], asPicture = false): unknown {
    if (typeof link !== "string" || link.length > MAX_URL || !/^(?:https:)?\/\//i.test(link)) return link;
    const normalized = link.startsWith("//") ? `https:${link}` : link;
    const inner = unproxied(normalized);

    const tenor = TENOR.exec(inner);
    if (tenor) {
        const [, id, , name, ext] = tenor;
        const video = !asPicture && /^(mp4|webm)$/i.test(ext);
        return `https://media.tenor.com/${id}${video ? quality.video : quality.tenor}/${name}.${video ? ext : "webp"}`;
    }

    const giphy = GIPHY.exec(inner);
    // A still (name_s) stays a still
    if (giphy && !/_s$/i.test(giphy[2])) return `https://i.giphy.com/media/${giphy[1]}/${quality.giphy}.webp`;
    if (giphy) return link;

    if (DISCORD_HOST.test(normalized) && !isVideoPath(normalized.split("?")[0])) {
        const params: Record<string, string> = { format: "webp", animated: "true" };
        const [width = 0, height = 0] = size ?? [];
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            const smaller = Math.min(width, height);
            params.width = String(Math.max(1, Math.floor(width / smaller * quality.cap)));
            params.height = String(Math.max(1, Math.floor(height / smaller * quality.cap)));
        }
        return setParams(normalized, params);
    }
    return link;
}

/** What the GIFs whose links Endcord changed were before, by their new link, kept to a few hundred */
export class ChangedLinks<V> {
    private readonly links = new Map<string, V>();
    constructor(private readonly max = 500) { }

    remember(changed: unknown, original: V) {
        if (typeof changed !== "string") return;
        this.links.delete(changed);
        this.links.set(changed, original);
        if (this.links.size > this.max) this.links.delete(this.links.keys().next().value!);
    }

    original(link: unknown): V | undefined {
        return typeof link === "string" ? this.links.get(link) : undefined;
    }

    clear() {
        this.links.clear();
    }
}
