/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's durable files (src/main/utils/durableFile.ts there), as far as the phone's file module allows: it has no
 * rename or fsync, so a file the app is killed in the middle of writing can be left half written. Every storage keeps a
 * last good copy beside it (.bak), written now and then after a write that completed, and a file that doesn't read as
 * JSON is kept aside (.damaged) and replaced by that copy instead of by an empty storage.
 */

/** How often a storage's last good copy is brought up to date: what a damaged file can lose at most */
export const BACKUP_EVERY = 30_000;

export interface DurableFile {
    /** The text of the file with this suffix ("" for the file itself), or undefined when there's no such file */
    read(suffix: string): Promise<string | undefined>;
    write(suffix: string, text: string): Promise<void>;
}

const lastBackup = new Map<string, number>();

/** Writes a storage, and now and then the same text as its last good copy */
export async function writeDurably(file: DurableFile, key: string, text: string, now = Date.now()) {
    await file.write("", text);
    if (now - (lastBackup.get(key) ?? -Infinity) < BACKUP_EVERY) return;
    lastBackup.set(key, now);
    try {
        await file.write(".bak", text);
    } catch (e) {
        console.warn(`[Endcord] The last good copy of ${key} couldn't be saved`, e);
    }
}

/**
 * A storage's contents: the file's, or when it's damaged its last good copy's, which is then written back. Undefined
 * when there's no file at all, or neither reads; a missing file is never brought back from its copy, since that's how
 * a storage that was deleted looks.
 */
export async function readDurably<T = unknown>(file: DurableFile, key: string): Promise<{ value: T; recovered: boolean; } | undefined> {
    let main: string | undefined;
    try {
        main = await file.read("");
    } catch {
        // Once more, for a moment when the file was busy
        try {
            main = await file.read("");
        } catch (e) {
            console.warn(`[Endcord] ${key} couldn't be read`, e);
            main = "";
        }
    }
    if (main === undefined) return undefined;
    try {
        return { value: JSON.parse(main) as T, recovered: false };
    } catch { }

    // Kept for whoever wants to look into it, before anything replaces it. An empty file, or one that couldn't be read,
    // has nothing to keep, and shouldn't replace a damaged copy kept before
    if (main.trim()) await file.write(".damaged", main).catch(() => { });
    let backup: string | undefined;
    try {
        backup = await file.read(".bak");
    } catch {
        backup = undefined;
    }
    if (backup !== undefined) {
        try {
            const value = JSON.parse(backup) as T;
            await file.write("", backup).catch(() => { });
            console.warn(`[Endcord] ${key} was damaged and was restored from its last good copy`);
            return { value, recovered: true };
        } catch { }
    }
    console.error(`[Endcord] ${key} was damaged and has no good copy; it starts over, and the damaged file is kept as .damaged`);
    return undefined;
}
