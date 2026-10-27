/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Data plugins keep from a server: avatar, banner and badge lists of a few megabytes, which JSON parsing on the JS
 * thread makes a stutter on a slow phone. Each is fetched the first time a plugin needs it rather than when the app
 * starts, refreshed at most every few hours, and only downloaded and parsed again when the server says it changed.
 */

const HOUR = 60 * 60 * 1000;

export interface RemoteData<T> {
    /** The data, or undefined until it has loaded; asking starts loading it, and refreshes it when it's old */
    get(): T | undefined;
    /** Called after new data loads, to draw what shows it again */
    onLoad(cb: () => void): () => void;
    /** Forgets the data, for a plugin that stops */
    clear(): void;
}

export function remoteJson<T>(url: string, options: { parse: (json: any) => T; refreshMs?: number; timeoutMs?: number; onError?: (e: unknown) => void; }): RemoteData<T> {
    const refreshMs = options.refreshMs ?? 6 * HOUR;
    let value: T | undefined;
    let etag: string | undefined;
    let lastModified: string | undefined;
    let checkedAt = 0;
    let loading: Promise<void> | undefined;
    // Bumped by clear(), so a load that finishes after its plugin stopped is dropped
    let generation = 0;
    const listeners = new Set<() => void>();

    async function load() {
        const started = generation;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
        try {
            // Asked only for a newer copy: by its ETag, or else by when it last changed, which servers without
            // ETags may still say
            const headers: Record<string, string> = {};
            if (value !== undefined && etag) headers["If-None-Match"] = etag;
            else if (value !== undefined && lastModified) headers["If-Modified-Since"] = lastModified;
            const res = await fetch(url, { headers, signal: controller.signal });
            if (started !== generation) return;
            checkedAt = Date.now();
            if (res.status === 304) return;
            if (!res.ok) throw new Error(`${url} answered ${res.status}`);
            const parsed = options.parse(await res.json());
            if (started !== generation) return;
            value = parsed;
            etag = res.headers.get("etag") ?? undefined;
            lastModified = res.headers.get("last-modified") ?? undefined;
            for (const cb of listeners) {
                try {
                    cb();
                } catch (e) {
                    console.error("[Endcord] a remote data listener failed", e);
                }
            }
        } finally {
            clearTimeout(timer);
        }
    }

    return {
        get() {
            if (!loading && Date.now() - checkedAt > refreshMs) {
                loading = load()
                    .catch(e => {
                        // Tried again in a few minutes rather than on the next call, so an outage isn't hammered
                        checkedAt = Date.now() - refreshMs + 5 * 60 * 1000;
                        options.onError?.(e);
                    })
                    .finally(() => loading = undefined);
            }
            return value;
        },
        onLoad(cb) {
            listeners.add(cb);
            return () => void listeners.delete(cb);
        },
        clear() {
            generation++;
            value = undefined;
            etag = undefined;
            lastModified = undefined;
            checkedAt = 0;
            listeners.clear();
        },
    };
}
