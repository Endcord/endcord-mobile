/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's settings snapshots (src/api/SettingsSnapshots.ts there): copies of the settings to go back to, one a
 * day while Discord comes up fine and one before anything that replaces them, like restoring a backup. They stay on
 * this phone, without the keys and passwords a backup file leaves out too, and without what people made with plugins.
 */

import { createBackup, parseBackup, restoreBackup } from "@core/backup";
import { createMMKVBackend, type StorageBackend } from "@core/vendetta/storage";
import { version } from "bunny-build-info";

export type SnapshotReason = "daily" | "before-restore";

export interface SettingsSnapshot {
    at: number;
    reason: SnapshotReason;
    /** The Endcord version that took it */
    endcord: string;
    /** The settings, as a backup file's text */
    text: string;
}

/** How many are kept, the newest */
export const MAX_SNAPSHOTS = 10;
const DAY = 24 * 60 * 60 * 1000;
/** Larger than the settings ever are; one bigger isn't kept */
const MAX_SNAPSHOT_SIZE = 2 * 1024 * 1024;
const REASONS: SnapshotReason[] = ["daily", "before-restore"];

let backend: StorageBackend | undefined;
const store = () => backend ??= createMMKVBackend("ENDCORD_SETTINGS_SNAPSHOTS", { list: [] });
let writing: Promise<unknown> = Promise.resolve();

/** What was kept, checked: the file is anyone's to edit */
export function readSnapshots(raw: unknown, now = Date.now()): SettingsSnapshot[] {
    const list = (raw as any)?.list;
    if (!Array.isArray(list)) return [];
    // A time that can't be shown as a date, or one still to come, which would stay the newest copy for good
    const takenAt = (at: unknown) => Number.isSafeInteger(at) && (at as number) >= 0 && (at as number) <= now + DAY;
    return list
        .filter((s: any) => takenAt(s?.at) && REASONS.includes(s?.reason) && typeof s?.text === "string" && s.text.length <= MAX_SNAPSHOT_SIZE)
        .map((s: any) => ({ at: s.at, reason: s.reason, endcord: typeof s.endcord === "string" ? s.endcord.slice(0, 40) : "?", text: s.text }))
        .sort((a: SettingsSnapshot, b: SettingsSnapshot) => b.at - a.at)
        .slice(0, MAX_SNAPSHOTS);
}

/** The same settings, whenever they were taken: a backup's text without the moment it was made */
const sameSettings = (a: string, b: string) => {
    try {
        const strip = (text: string) => JSON.stringify({ ...JSON.parse(text), createdAt: undefined, endcord: undefined });
        return strip(a) === strip(b);
    } catch {
        return false;
    }
};

/** Adds a snapshot to a list: newest first, the oldest dropped past the limit, none twice in a row */
export function withSnapshot(list: SettingsSnapshot[], snapshot: SettingsSnapshot): SettingsSnapshot[] {
    const latest = list[0];
    if (latest && latest.reason === snapshot.reason && sameSettings(latest.text, snapshot.text)) {
        return [{ ...latest, at: snapshot.at }, ...list.slice(1)];
    }
    return [snapshot, ...list].slice(0, MAX_SNAPSHOTS);
}

export async function listSnapshots(): Promise<SettingsSnapshot[]> {
    await writing.catch(() => { });
    return readSnapshots(await store().get());
}

export function takeSnapshot(reason: SnapshotReason, now = Date.now()) {
    writing = writing.catch(() => { }).then(async () => {
        const text = await createBackup({ withData: false });
        if (text.length > MAX_SNAPSHOT_SIZE) return;
        const list = readSnapshots(await store().get());
        await store().set({ list: withSnapshot(list, { at: now, reason, endcord: version, text }) });
    });
    return writing;
}

/** Once a day, after Discord has come up fine: settings that worked are the ones worth going back to */
export async function takeDailySnapshot(now = Date.now()) {
    const list = await listSnapshots();
    const lastDaily = list.find(s => s.reason === "daily");
    if (lastDaily && now - lastDaily.at < DAY && now >= lastDaily.at) return;
    await takeSnapshot("daily", now);
}

/** Puts a snapshot's settings back, after keeping the current ones as one more: going back can be undone */
export async function restoreSnapshot(snapshot: SettingsSnapshot): Promise<number> {
    const backup = parseBackup(snapshot.text);
    await takeSnapshot("before-restore");
    // Snapshots keep only settings; what plugins made stays as it is, whatever the file says
    return await restoreBackup({ ...backup, data: {} });
}
