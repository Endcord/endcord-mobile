/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Saved timers for reminders and scheduled messages. They survive restarts: anything that came due while Discord was
 * closed runs as soon as the plugin starts again, marked as late.
 */

import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";

export interface ScheduledItem {
    id: string;
    /** When it's due, in milliseconds since the epoch */
    at: number;
}

// setTimeout overflows past about 24 days; longer waits are re-armed
const MAX_WAIT = 24 * 60 * 60 * 1000;

export function createScheduler<T extends ScheduledItem>(key: string, onDue: (item: T, late: boolean) => void) {
    const storage = wrapSync(createStorage<{ items: T[]; }>(createMMKVBackend(`ENDCORD_SCHEDULE_${key}`, { items: [] })));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    // Plugins sharing a scheduler (RemindMe and MessageReminders) each start and stop it
    let users = 0;

    const items = (): T[] => Array.isArray(storage.items) ? storage.items : [];

    function arm() {
        clearTimeout(timer);
        if (!running || !items().length) return;
        const next = Math.min(...items().map(i => i.at));
        timer = setTimeout(tick, Math.min(Math.max(next - Date.now(), 0), MAX_WAIT));
    }

    function tick() {
        const now = Date.now();
        const due = items().filter(i => i.at <= now);
        if (due.length) storage.items = items().filter(i => i.at > now);
        for (const item of due) {
            try {
                onDue(item, now - item.at > 60_000);
            } catch (e) {
                console.error(`[Endcord] ${key}: a scheduled item failed`, e);
            }
        }
        arm();
    }

    return {
        async start() {
            users++;
            await awaitStorage(storage);
            if (running || !users) return;
            running = true;
            tick();
        },
        stop() {
            users = Math.max(0, users - 1);
            if (users) return;
            running = false;
            clearTimeout(timer);
        },
        add(item: Omit<T, "id"> & { id?: string; }) {
            const full = { ...item, id: item.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` } as T;
            storage.items = [...items(), full].sort((a, b) => a.at - b.at);
            arm();
            return full;
        },
        remove(id: string) {
            storage.items = items().filter(i => i.id !== id);
            arm();
        },
        list: items,
        /** The items, re-rendering when they change */
        useItems(): T[] {
            useProxy(storage);
            return items();
        },
    };
}

/** "10m", "2h", "1d", "1h30m" to milliseconds, or undefined */
export function parseDuration(text: string): number | undefined {
    const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
    const parts = [...text.toLowerCase().replace(/\s+/g, "").matchAll(/(\d+(?:\.\d+)?)([smhdw])/g)];
    if (!parts.length || parts.map(p => p[0]).join("") !== text.toLowerCase().replace(/\s+/g, "")) return undefined;
    return parts.reduce((sum, [, n, unit]) => sum + Number(n) * units[unit], 0);
}
