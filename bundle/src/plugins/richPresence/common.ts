/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * What RichPresence's services share: requests that give up and can be stopped, the check that a server you typed
 * is one credentials may go to, and the pictures Discord shows in an activity.
 */

import { hostOf, isPrivateUrl } from "@lib/utils/publicAddress";
import safeFetch, { readJson } from "@lib/utils/safeFetch";

import { api } from "../hooks";
import { externalAsset } from "../shared/presence";

export type Activity = Record<string, unknown>;

/** The most a service's answer may weigh: a few sessions or tracks */
export const MAX_ANSWER_BYTES = 2 * 1024 * 1024;
/** The longest any text from a server is kept: Discord cuts activity lines at 128 */
export const MAX_TEXT = 128;

/** Text from a server, as a line of an activity: a string, trimmed and cut to what Discord shows */
export function line(value: unknown): string | undefined {
    if (typeof value !== "string" && typeof value !== "number") return undefined;
    const text = String(value).replace(/\s+/g, " ").trim();
    if (!text) return undefined;
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

/** A number from a server, when it is one */
export const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * A server address you typed, ready to have paths added, or why it can't be used: https on the internet, or plain
 * http only on this phone itself. Addresses on your network aren't reachable through Discord anyway (it fetches
 * covers from there), and credentials must not travel unencrypted.
 */
export function serverBase(input: string): { base: string; } | { error: "empty" | "invalid" | "insecure" | "private"; } {
    let url = String(input ?? "").trim();
    if (!url) return { error: "empty" };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
    const host = hostOf(url)?.toLowerCase();
    if (!host || /[\s\\]/.test(url) || url.length > 500) return { error: "invalid" };
    const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    if (/^http:\/\//i.test(url)) {
        if (!local) return { error: "insecure" };
    } else if (!/^https:\/\//i.test(url)) return { error: "invalid" };
    else if (isPrivateUrl(url) && !local) return { error: "private" };
    // No query or fragment: paths are added after it
    const base = url.split(/[?#]/)[0].replace(/\/+$/, "");
    return { base };
}

/** A GET or POST that gives up after a while, and when the plugin stops */
export async function request(url: string, signal: AbortSignal, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) abort();
    signal.addEventListener?.("abort", abort);
    const timer = setTimeout(abort, timeoutMs);
    try {
        return await safeFetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
        signal.removeEventListener?.("abort", abort);
    }
}

/** The answer as JSON, or null for an empty "nothing now" answer */
export async function getJson<T = any>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T | null> {
    const res = await request(url, signal, init);
    if (res.status === 204) return null;
    return readJson<T>(res, MAX_ANSWER_BYTES);
}

const namedAssets = new Map<string, Promise<Map<string, string>>>();

/** An application's own picture by name, as Discord shows it in an activity */
export async function namedAsset(appId: string, name: string): Promise<string | undefined> {
    let assets = namedAssets.get(appId);
    if (!assets) {
        assets = api("get", `/oauth2/applications/${appId}/assets`).then((list: any) => new Map(
            (Array.isArray(list) ? list : []).filter(a => typeof a?.name === "string" && typeof a?.id === "string").map(a => [a.name, a.id] as [string, string]),
        ));
        namedAssets.set(appId, assets);
        // Asked again next time when it failed
        assets.catch(() => namedAssets.delete(appId));
    }
    return (await assets.catch(() => undefined))?.get(name);
}

/** A picture for an activity: a link goes through Discord's media proxy, a name is the application's own */
export async function asset(appId: string, key: string | undefined): Promise<string | undefined> {
    if (!key) return undefined;
    try {
        return /^https?:\/\//.test(key) ? await externalAsset(appId, key) : await namedAsset(appId, key);
    } catch {
        return undefined;
    }
}

export const clearAssetCache = () => namedAssets.clear();

/**
 * Whether two activities show the same: a service asks every few seconds, and times worked out from a position move
 * by a moment each time, which isn't worth a new presence
 */
export function sameActivity(a: Activity | null, b: Activity | null): boolean {
    if (!a || !b) return a === b;
    const { timestamps: ta, ...restA } = a as { timestamps?: Record<string, unknown>; };
    const { timestamps: tb, ...restB } = b as { timestamps?: Record<string, unknown>; };
    if (JSON.stringify(restA) !== JSON.stringify(restB)) return false;
    if (!ta || !tb) return !ta && !tb;
    const close = (x: unknown, y: unknown) => x === y || typeof x === "number" && typeof y === "number" && Math.abs(x - y) < 3000;
    return close(ta.start, tb.start) && close(ta.end, tb.end);
}

/** "3:07", or "1:02:05" past an hour */
export function formatDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
