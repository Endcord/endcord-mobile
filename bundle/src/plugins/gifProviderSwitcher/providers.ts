/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * GifProviderSwitcher's pure part: Tenor's and Giphy's answers turned into the GIFs Discord's own API answers with,
 * so Discord's GIF picker shows them as if they came from Discord. Everything here comes from those services, so it is
 * checked and capped before Discord sees it. Nothing in this file touches Discord or the network.
 */

/** A GIF as Discord's /gifs endpoints list it, which its GIF picker store reads */
export interface DiscordGif {
    id: string;
    title: string;
    url: string;
    src: string;
    gif_src: string;
    width: number;
    height: number;
    preview: string;
}

export interface TrendingCategories {
    categories: Array<{ name: string; src: string; }>;
    gifs: Array<{ src: string; }>;
}

export type Provider = "tenor" | "giphy" | "klipy";

// API keys Endcord PC uses: Tenor's is the GBoard app's on iOS, Giphy's the giphy.com website's
export const TENOR_KEY = "3Z0688EVWYKH";
export const GIPHY_KEY = "Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g";

export const TENOR_API = "https://api.tenor.com/v1";
export const GIPHY_API = "https://api.giphy.com/v1";

/** The most results asked of a provider at once, both services' page size */
export const MAX_LIMIT = 50;

const MAX_URL = 2048;
const MAX_TITLE = 200;
const MAX_TERM = 100;
const MAX_CATEGORIES = 60;
const MAX_SUGGESTIONS = 10;

/** The providers a setting's value names, in its order; Klipy is Discord's own */
export function parseProviders(value: string): Provider[] {
    const picked = String(value ?? "").split(",").map(p => p.trim()).filter((p): p is Provider => p === "tenor" || p === "giphy" || p === "klipy");
    const unique = [...new Set(picked)];
    return unique.length ? unique : ["tenor"];
}

/** The provider categories and suggestions come from: the first one that isn't Discord's own */
export const primaryProvider = (providers: Provider[]): Provider => providers.find(p => p !== "klipy") ?? "klipy";

export type GifEndpoint = "search" | "trending" | "trending-gifs" | "suggest" | "select";

const ENDPOINT = /^(?:https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com)?(?:\/api(?:\/v\d+)?)?\/gifs\/(search|trending|trending-gifs|suggest|select)\/?$/;

/** Which of Discord's GIF endpoints a request goes to, from its address with or without the API's prefix */
export function gifEndpoint(url: unknown): GifEndpoint | undefined {
    if (typeof url !== "string" || url.length > MAX_URL) return;
    return ENDPOINT.exec(url.split(/[?#]/)[0])?.[1] as GifEndpoint | undefined;
}

/** A request's query, from its query object and from its address, as text */
export function requestQuery(request: unknown): Record<string, string> {
    const out: Record<string, string> = Object.create(null);
    const url = typeof request === "string" ? request : (request as any)?.url;
    if (typeof url === "string" && url.includes("?")) {
        for (const pair of url.slice(url.indexOf("?") + 1).split("#")[0].split("&")) {
            const [key, value = ""] = pair.split("=");
            try {
                if (key) out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, " "));
            } catch { }
        }
    }
    const query = typeof request === "object" && request ? (request as any).query : undefined;
    if (query && typeof query === "object") {
        for (const [key, value] of Object.entries(query)) {
            if (value != null && typeof value !== "object") out[key] = String(value);
        }
    }
    return out;
}

/** How many results to show in all: as many as Discord asked its own API for */
export function totalLimit(requested: string | undefined): number {
    const asked = Number(requested);
    return Number.isFinite(asked) && asked >= 1 ? Math.min(Math.floor(asked), MAX_LIMIT * 2) : MAX_LIMIT;
}

/** How many results to ask each provider for, so all of them together bring no more than Discord's own would */
export const perProvider = (total: number, providers: number) => Math.max(1, Math.min(MAX_LIMIT, Math.ceil(total / Math.max(1, providers))));

export const buildUrl = (base: string, params: Record<string, string>) =>
    `${base}?${Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;

/** Tenor's locale: like en_us */
export const tenorLocale = (locale: string) => (locale || "en-US").replace("-", "_").toLowerCase();

/** Giphy takes two-letter codes, plus zh-CN and zh-TW */
export function giphyLang(locale: string) {
    const lower = (locale || "en").toLowerCase();
    if (lower.startsWith("zh")) return lower.includes("tw") || lower.includes("hant") ? "zh-TW" : "zh-CN";
    return lower.split(/[-_]/)[0] || "en";
}

const isLink = (value: unknown): value is string => typeof value === "string" && value.length <= MAX_URL && /^https:\/\/[^\s/?#\\]+/i.test(value) && !/[\s\0-\x1f\x7f]/.test(value);
const text = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : "";
const size = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n <= 10000 ? Math.round(n) : 0;
};

export type MediaKind = "webp" | "gif" | "mp4" | "webm" | "unknown";

/**
 * What kind of media Discord asked for (its media_format), so a GIF is shown the way the picker draws that kind: a
 * picture stays a picture and a video a video
 */
export function mediaKind(format: string | undefined): MediaKind {
    const f = String(format ?? "").toLowerCase();
    if (f.includes("webp")) return "webp";
    if (f.includes("gif")) return "gif";
    if (f.includes("mp4")) return "mp4";
    if (f.includes("webm")) return "webm";
    return "unknown";
}

const TENOR_FORMATS: Record<MediaKind, string[]> = {
    webp: ["webp", "tinywebp", "nanowebp", "tinygif", "gif"],
    gif: ["tinygif", "gif", "nanogif", "mediumgif"],
    mp4: ["tinymp4", "mp4", "nanomp4", "loopedmp4"],
    webm: ["tinywebm", "webm", "nanowebm", "tinymp4", "mp4"],
    // Endcord PC's choice when it isn't the picture format
    unknown: ["tinywebm", "webm", "tinymp4", "mp4"],
};

/** One of Tenor's v1 results as Discord's, or null when it lacks what the picker needs */
export function tenorToDiscord(item: any, format?: string): DiscordGif | null {
    const media = Array.isArray(item?.media) ? item.media[0] : undefined;
    if (!media || typeof media !== "object" || typeof item.id !== "string" && typeof item.id !== "number") return null;
    const wanted = String(format ?? "");
    const keys = [wanted, ...TENOR_FORMATS[mediaKind(format)]];
    const key = keys.find(k => k && Object.prototype.hasOwnProperty.call(media, k) && isLink(media[k]?.url));
    const shown = key ? media[key] : undefined;
    const { gif } = media;
    if (!shown || !isLink(item.itemurl)) return null;
    const dims = Array.isArray(shown.dims) ? shown.dims : [];
    const width = size(dims[0]), height = size(dims[1]);
    if (!width || !height) return null;
    return {
        id: String(item.id).slice(0, 64),
        title: text(item.title, MAX_TITLE) || text(item.h1_title, MAX_TITLE),
        url: item.itemurl,
        src: shown.url,
        gif_src: isLink(gif?.url) ? gif.url : shown.url,
        width,
        height,
        preview: isLink(shown.preview) ? shown.preview : shown.url,
    };
}

/** One of Giphy's results as Discord's, or null when it lacks what the picker needs */
export function giphyToDiscord(item: any, format?: string): DiscordGif | null {
    const images = item?.images;
    if (!images || typeof images !== "object" || typeof item.id !== "string") return null;
    const { original, fixed_height: fixed, fixed_height_still: still } = images;
    const kind = mediaKind(format);
    // Giphy has pictures (GIF, WebP) and MP4 videos, but no WebM: a WebM player plays the MP4
    const src = kind === "webp" ? fixed?.webp ?? fixed?.url : kind === "gif" ? fixed?.url : fixed?.mp4;
    if (!isLink(src) || !isLink(original?.url) || !isLink(item.url)) return null;
    const width = size(fixed.width), height = size(fixed.height);
    if (!width || !height) return null;
    return {
        id: item.id.slice(0, 64),
        title: text(item.title, MAX_TITLE),
        url: item.url,
        src,
        gif_src: original.url,
        width,
        height,
        preview: isLink(still?.url) ? still.url : original.url,
    };
}

export const tenorResults = (json: any, format?: string) =>
    (Array.isArray(json?.results) ? json.results : []).slice(0, MAX_LIMIT).map((r: any) => tenorToDiscord(r, format)).filter(Boolean) as DiscordGif[];

export const giphyResults = (json: any, format?: string) =>
    (Array.isArray(json?.data) ? json.data : []).slice(0, MAX_LIMIT).map((r: any) => giphyToDiscord(r, format)).filter(Boolean) as DiscordGif[];

const terms = (list: unknown[]) => [...new Set(list.filter((s): s is string => typeof s === "string" && !!s.trim()).map(s => s.slice(0, MAX_TERM)))].slice(0, MAX_SUGGESTIONS);

export const tenorSuggestions = (json: any) => terms(Array.isArray(json?.results) ? json.results : []);
export const giphySuggestions = (json: any) => terms((Array.isArray(json?.data) ? json.data : []).map((t: any) => t?.name));

function categories(list: Array<{ name: unknown; src: unknown; }>): TrendingCategories | null {
    const kept = list
        .filter(c => typeof c.name === "string" && c.name.trim() && isLink(c.src))
        .slice(0, MAX_CATEGORIES)
        .map(c => ({ name: (c.name as string).slice(0, MAX_TERM), src: c.src as string }));
    return kept.length ? { categories: kept, gifs: [{ src: kept[0].src }] } : null;
}

/** Tenor's featured categories, as Discord's /gifs/trending answers */
export const tenorCategories = (json: any) => categories((Array.isArray(json?.tags) ? json.tags : []).map((t: any) => ({ name: t?.searchterm, src: t?.image })));

/** Giphy's categories, as Discord's /gifs/trending answers */
export const giphyCategories = (json: any) => categories((Array.isArray(json?.data) ? json.data : []).map((c: any) => ({ name: c?.name, src: c?.gif?.images?.fixed_height?.url })));

/** Each provider's results in turn, like Endcord PC, at most `limit` of them */
export function interleave(pages: DiscordGif[][], limit: number): DiscordGif[] {
    const out: DiscordGif[] = [];
    const longest = Math.max(0, ...pages.map(p => p.length));
    for (let i = 0; i < longest && out.length < limit; i++) {
        for (const page of pages) {
            if (page[i] && out.length < limit) out.push(page[i]);
        }
    }
    return out;
}

/**
 * Whether a provider's answer (results or suggestions) has its list in it. An error answer, or one in a shape this
 * doesn't know, doesn't, and counts as the provider failing rather than as it finding nothing.
 */
export const hasList = (provider: "tenor" | "giphy", json: any) => Array.isArray(provider === "tenor" ? json?.results : json?.data);

export type Settled<T> = { ok: true; value: T; } | { ok: false; error: unknown; };

/**
 * What the picker shows from the providers' answers (in `chosen`'s order), each in turn, or null when every provider
 * other than Discord's own failed: then Discord's own answer is shown, as if the plugin weren't on
 */
export function combineResults(chosen: readonly Provider[], settled: ReadonlyArray<Settled<DiscordGif[]>>, limit: number): DiscordGif[] | null {
    if (chosen.every((provider, i) => provider === "klipy" || !settled[i]?.ok)) return null;
    return interleave(settled.flatMap(r => r.ok ? [r.value] : []), limit);
}

/** The provider and its own ID in an ID this plugin gave a result, like tenor:123 */
export function splitId(id: unknown): { provider: Provider; id: string; } | undefined {
    if (typeof id !== "string") return;
    const at = id.indexOf(":");
    const provider = id.slice(0, at);
    if (at < 1 || provider !== "tenor" && provider !== "giphy" && provider !== "klipy") return;
    return { provider, id: id.slice(at + 1) };
}

/** Results with their provider in front of their IDs, so picking one can be told to the right service */
export const tagged = (provider: Provider, items: DiscordGif[]) => items.map(item => ({ ...item, id: `${provider}:${item.id}` }));

const NAMES: Record<Provider, string> = { tenor: "Tenor", giphy: "Giphy", klipy: "Klipy" };

/** The search box's hint with the providers in use in place of Discord's own */
export function replaceProviderName(placeholder: string, providers: Provider[]) {
    return placeholder.replace(/Klipy/g, providers.map(p => NAMES[p]).join(", "));
}
