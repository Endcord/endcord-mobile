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
    let length: string | undefined;
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
            // A server without ETags may still say how big the file is: the same size is taken as unchanged
            if (!etag && length && value !== undefined) {
                const head = await fetch(url, { method: "HEAD", signal: controller.signal }).catch(() => undefined);
                if (started !== generation) return;
                if (head?.ok && head.headers.get("content-length") === length) {
                    checkedAt = Date.now();
                    return;
                }
            }
            const res = await fetch(url, {
                headers: etag ? { "If-None-Match": etag } : {},
                signal: controller.signal,
            });
            if (started !== generation) return;
            checkedAt = Date.now();
            if (res.status === 304) return;
            if (!res.ok) throw new Error(`${url} answered ${res.status}`);
            const parsed = options.parse(await res.json());
            if (started !== generation) return;
            value = parsed;
            etag = res.headers.get("etag") ?? undefined;
            length = res.headers.get("content-length") ?? undefined;
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
            length = undefined;
            checkedAt = 0;
            listeners.clear();
        },
    };
}
