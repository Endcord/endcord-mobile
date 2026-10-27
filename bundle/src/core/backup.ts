/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Backs up Endcord's settings to a file the user keeps, and restores them, like Endcord PC's settings export.
 *
 * A backup only carries what is safe to take from a file someone else made: the language, which plugins are on and
 * their settings, what the user made with plugins (profiles, notes, collections...) and the addresses of their
 * themes and fonts. Developer settings stay out (DevTools on start or the eval command would let whoever made the file
 * run code in the app), and so do plugins from repositories, which are code, and the logs plugins keep.
 */

import { LANGUAGES, t } from "@core/i18n";
import { fonts, installFont, selectFont } from "@lib/addons/fonts";
import { corePluginInstances, pluginSettings } from "@lib/addons/plugins";
import { fetchTheme, getCurrentTheme, selectTheme, themes } from "@lib/addons/themes";
import { writeDocument } from "@lib/api/native/fs";
import { NativeFileModule } from "@lib/api/native/modules";
import { settings } from "@lib/api/settings";
import { awaitStorage } from "@lib/api/storage";
import { manifest } from "@plugins/manifest";
import { version } from "bunny-build-info";

const FORMAT = "endcord-settings";
const VERSION = 1;
/** Larger than any backup Endcord makes; a bigger file isn't one */
export const MAX_BACKUP_SIZE = 8 * 1024 * 1024;

/** The general settings a backup carries */
const SETTINGS_KEYS = ["language", "enableDiscordDeveloperSettings"] as const;

/** Storages of what the user made with plugins; the logs and caches plugins keep for themselves aren't in backups */
const DATA_STORES = [
    "ENDCORD_BOOKMARKS", "ENDCORD_CHANNEL_NOTES", "ENDCORD_CUSTOM_PROFILE", "ENDCORD_CUSTOM_SOUNDS",
    "ENDCORD_FAKE_CONNECTIONS", "ENDCORD_FAKE_DMS", "ENDCORD_FAVORITE_MEDIA", "ENDCORD_FRIEND_NICKNAMES",
    "ENDCORD_FRIEND_TAGS", "ENDCORD_GIF_COLLECTIONS", "ENDCORD_MESSAGE_TAGS", "ENDCORD_MESSAGE_VAULT", "ENDCORD_PINS",
    "ENDCORD_PROFILE_SETS", "ENDCORD_STATUS_PRESETS", "ENDCORD_TEXT_REPLACE_RULES",
];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json; };
type JsonObject = { [key: string]: Json; };

export interface Backup {
    format: typeof FORMAT;
    version: number;
    /** The Endcord version that made it */
    endcord: string;
    createdAt: string;
    settings: Partial<Record<typeof SETTINGS_KEYS[number], Json>>;
    /** Built-in plugins by ID, and whether each is on */
    plugins: Record<string, boolean>;
    /** Endcord plugins' settings by plugin ID */
    pluginSettings: Record<string, JsonObject>;
    /** What the user made with plugins, by storage */
    data: Record<string, JsonObject>;
    themes: { urls: string[]; selected: string | null; };
    fonts: { urls: string[]; selected: string | null; };
}

const storePath = (name: string) => `vd_mmkv/${name}`;

async function readStore(name: string): Promise<JsonObject | undefined> {
    const path = `${NativeFileModule.getConstants().DocumentsDirPath}/${storePath(name)}`;
    if (!await NativeFileModule.fileExists(path)) return undefined;
    try {
        const data = JSON.parse(await NativeFileModule.readFile(path, "utf8"));
        return isPlainObject(data) ? data : undefined;
    } catch {
        return undefined;
    }
}

const writeStore = (name: string, data: JsonObject) => writeDocument(storePath(name), JSON.stringify(data));

function isPlainObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** No key anywhere in it could change an object's prototype when copied, as Endcord PC checks */
function isSafe(value: unknown, depth = 0): boolean {
    if (depth > 64) return false;
    if (typeof value !== "object" || value === null) return true;
    for (const key of Object.keys(value)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") return false;
        if (!isSafe((value as any)[key], depth + 1)) return false;
    }
    return true;
}

const isHttps = (url: unknown): url is string => {
    if (typeof url !== "string") return false;
    try {
        return new URL(url).protocol === "https:";
    } catch {
        return false;
    }
};

/** Endcord's settings as the text of a backup file */
export async function createBackup(): Promise<string> {
    await awaitStorage(pluginSettings);

    const plugins: Record<string, boolean> = {};
    for (const id of corePluginInstances.keys()) plugins[id] = Boolean(pluginSettings[id]?.enabled);

    const pluginStores: Record<string, JsonObject> = {};
    await Promise.all(manifest.filter(p => p.hasSettings).map(async p => {
        const store = await readStore(`ENDCORD_PLUGIN_${p.id}`);
        if (store && Object.keys(store).length) pluginStores[p.id] = store;
    }));

    const data: Record<string, JsonObject> = {};
    await Promise.all(DATA_STORES.map(async name => {
        const store = await readStore(name);
        if (store && Object.keys(store).length) data[name] = store;
    }));

    const installedFonts = Object.entries(fonts).filter(([name]) => name !== "__selected") as [string, any][];
    const selectedFont = installedFonts.find(([name]) => name === fonts.__selected)?.[1]?.source;

    const backup: Backup = {
        format: FORMAT,
        version: VERSION,
        endcord: version,
        createdAt: new Date().toISOString(),
        settings: Object.fromEntries(SETTINGS_KEYS.filter(k => settings[k] !== undefined).map(k => [k, settings[k] as Json])),
        plugins,
        pluginSettings: pluginStores,
        data,
        themes: {
            urls: Object.keys(themes).filter(isHttps),
            selected: getCurrentTheme()?.id ?? null,
        },
        fonts: {
            urls: installedFonts.map(([, font]) => font?.source).filter(isHttps),
            selected: isHttps(selectedFont) ? selectedFont : null,
        },
    };
    return JSON.stringify(backup, null, 2);
}

/** The backup in a file's text, keeping only what Endcord takes from backups; throws, with a message to show, when it isn't one */
export function parseBackup(text: string): Backup {
    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(t("This file isn't an Endcord backup"));
    }
    if (!isPlainObject(parsed) || parsed.format !== FORMAT || typeof parsed.version !== "number") {
        throw new Error(t("This file isn't an Endcord backup"));
    }
    if (parsed.version > VERSION) throw new Error(t("This backup is from a newer Endcord. Update Endcord, then try again."));
    if (!isSafe(parsed)) throw new Error(t("This backup is damaged and can't be restored"));

    const object = (value: unknown): JsonObject => isPlainObject(value) ? value : {};
    const raw = object(parsed.settings);
    const backupSettings: Backup["settings"] = {};
    if (raw.language === "auto" || LANGUAGES.some(l => l.code === raw.language)) backupSettings.language = raw.language;
    if (typeof raw.enableDiscordDeveloperSettings === "boolean") backupSettings.enableDiscordDeveloperSettings = raw.enableDiscordDeveloperSettings;

    const plugins = Object.fromEntries(Object.entries(object(parsed.plugins))
        .filter(([id, on]) => corePluginInstances.has(id) && typeof on === "boolean")) as Record<string, boolean>;
    const pluginStores = Object.fromEntries(Object.entries(object(parsed.pluginSettings))
        .filter(([id, store]) => manifest.some(p => p.id === id) && isPlainObject(store))) as Record<string, JsonObject>;
    const data = Object.fromEntries(Object.entries(object(parsed.data))
        .filter(([name, store]) => DATA_STORES.includes(name) && isPlainObject(store))) as Record<string, JsonObject>;

    const addons = (value: unknown): Backup["themes"] => {
        const list = object(value);
        const urls = [...new Set(Array.isArray(list.urls) ? list.urls.filter(isHttps) : [])].slice(0, 200);
        return { urls, selected: typeof list.selected === "string" && urls.includes(list.selected) ? list.selected : null };
    };

    return {
        format: FORMAT,
        version: parsed.version,
        endcord: typeof parsed.endcord === "string" ? parsed.endcord : "?",
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
        settings: backupSettings,
        plugins,
        pluginSettings: pluginStores,
        data,
        themes: addons(parsed.themes),
        fonts: addons(parsed.fonts),
    };
}

/**
 * Replaces Endcord's settings with a backup's. Discord should reload right after: plugins that are running hold their
 * settings in memory until then. Resolves to how many themes and fonts couldn't be installed again.
 */
export async function restoreBackup(backup: Backup): Promise<number> {
    await awaitStorage(pluginSettings);

    for (const key of SETTINGS_KEYS) {
        if (key in backup.settings) (settings as any)[key] = backup.settings[key];
    }
    for (const [id, enabled] of Object.entries(backup.plugins)) {
        pluginSettings[id] = { ...pluginSettings[id], enabled };
    }

    await Promise.all([
        ...Object.entries(backup.pluginSettings).map(([id, store]) => writeStore(`ENDCORD_PLUGIN_${id}`, store)),
        ...Object.entries(backup.data).map(([name, store]) => writeStore(name, store)),
    ]);

    const installed = await Promise.allSettled([
        ...backup.themes.urls.map(url => fetchTheme(url, url === backup.themes.selected)),
        ...backup.fonts.urls.map(url => installFont(url, url === backup.fonts.selected)),
    ]);
    if (backup.themes.selected === null) await selectTheme(null);
    if (backup.fonts.selected === null && fonts.__selected) await selectFont(null);

    // The plugin manager saves what's on half a second after a change
    await new Promise(resolve => setTimeout(resolve, 800));
    return installed.filter(r => r.status === "rejected").length;
}
