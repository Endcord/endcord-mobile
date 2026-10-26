/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import type { Author } from "@lib/addons/types";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { Logger, LoggerClass } from "@lib/utils/logger";
import type { ComponentType } from "react";

export type SettingDef =
    | { type: "boolean"; label: string; description?: string; default: boolean; }
    | { type: "select"; label: string; description?: string; default: string; options: { label: string; value: string; }[]; }
    | { type: "number"; label: string; description?: string; default: number; min: number; max: number; }
    | { type: "string"; label: string; description?: string; default: string; placeholder?: string; multiline?: boolean; };

export type SettingsSchema = Record<string, SettingDef>;

/** Endcord PC's plugin tags that apply on mobile */
export const PLUGIN_TAGS = ["Appearance", "Chat", "Customisation", "Emotes", "Friends", "Fun", "Media", "Notifications", "Privacy", "Servers", "Utility", "Voice"] as const;
export type PluginTag = typeof PLUGIN_TAGS[number];

// The tags' labels, translated where the filters show them
void [tx("Appearance"), tx("Chat"), tx("Customisation"), tx("Emotes"), tx("Friends"), tx("Fun"), tx("Media"), tx("Notifications"), tx("Privacy"), tx("Servers"), tx("Utility"), tx("Voice")];

export type SettingsValues<S extends SettingsSchema> = {
    -readonly [K in keyof S]: S[K]["default"] extends boolean ? boolean : S[K]["default"] extends number ? number : string;
};

export interface PluginContext<S extends SettingsSchema> {
    /** The plugin's settings, saved as they change */
    store: SettingsValues<S>;
    logger: Logger;
    /** Registers functions to call when the plugin stops, such as unpatches */
    cleanup(...fns: Array<(() => unknown) | undefined | null | void>): void;
}

export interface EndcordPluginDefinition<S extends SettingsSchema = SettingsSchema> {
    /** Stable ID, used for its settings: endcord.<name> */
    id: string;
    /** The plugin's name, the same as on Endcord PC */
    name: string;
    /** English, marked with tx() so it is translated where it is shown */
    description: string;
    authors: Author[];
    /** Position in Endcord PC's list of popular plugins, which are listed first */
    popular?: number;
    /** Named asset shown next to the name */
    icon?: string;
    /** Endcord PC's tags, for the plugin page's filters */
    tags?: PluginTag[];
    settings?: S;
    start(ctx: PluginContext<S>): void | Promise<void>;
    stop?(ctx: PluginContext<S>): void;
    /** Shown under the generated settings, for settings that need more than a row */
    SettingsComponent?: ComponentType<{ store: SettingsValues<S>; }>;
}

export interface EndcordPlugin<S extends SettingsSchema = SettingsSchema> extends EndcordPluginDefinition<S> {
    store: SettingsValues<S>;
    /** Set when the plugin failed to start, until it is started again */
    error?: unknown;
}

export const ENDCORD_AUTHOR: Author = { name: "rootpoi" };

export function definePlugin<S extends SettingsSchema>(def: EndcordPluginDefinition<S>): EndcordPlugin<S> {
    const defaults = Object.fromEntries(Object.entries(def.settings ?? {}).map(([k, v]) => [k, v.default]));
    let store: SettingsValues<S> | undefined;
    // Opened the first time something reads it, so the settings of plugins that are off aren't loaded at startup
    Object.defineProperty(def, "store", {
        enumerable: true,
        get: () => store ??= wrapSync(createStorage<SettingsValues<S>>(createMMKVBackend(`ENDCORD_PLUGIN_${def.id}`, defaults))),
    });
    return def as EndcordPlugin<S>;
}

/** Calls back with the setting's key whenever one of the store's settings changes, wherever it is changed from */
export function onSettingChange(store: object, cb: (key: string) => void) {
    const emitter = (store as any)[Symbol.for("vendetta.storage.emitter")];
    if (!emitter) return () => { };
    const listener = (_event: string, data: { path: string[]; }) => {
        try {
            cb(data.path[0]);
        } catch (e) {
            console.error("[Endcord] setting listener failed", e);
        }
    };
    emitter.on("SET", listener);
    return () => emitter.off("SET", listener);
}

const running = new Map<string, Array<() => unknown>>();

/** Fills in settings added after the plugin's storage was first created */
async function loadStore(plugin: EndcordPlugin) {
    await awaitStorage(plugin.store);
    for (const [key, def] of Object.entries(plugin.settings ?? {})) {
        const value = (plugin.store as any)[key];
        if (value === undefined || typeof value !== typeof def.default) (plugin.store as any)[key] = def.default;
    }
}

function runCleanups(id: string) {
    const fns = running.get(id);
    running.delete(id);
    if (!fns) return;
    // Last registered first, so patches stacked on each other come off in order
    for (const fn of fns.reverse()) {
        try {
            fn();
        } catch (e) {
            console.error(`[Endcord] ${id}: cleanup failed`, e);
        }
    }
}

export async function startEndcordPlugin(plugin: EndcordPlugin) {
    if (running.has(plugin.id)) return;

    const cleanups: Array<() => unknown> = [];
    running.set(plugin.id, cleanups);
    const ctx: PluginContext<any> = {
        store: plugin.store,
        logger: new LoggerClass(`Endcord/${plugin.name}`),
        cleanup: (...fns) => {
            for (const fn of fns) if (typeof fn === "function") cleanups.push(fn);
        }
    };

    try {
        await loadStore(plugin);
        await plugin.start(ctx);
        plugin.error = undefined;
    } catch (e) {
        plugin.error = e;
        runCleanups(plugin.id);
        console.error(`[Endcord] ${plugin.name} failed to start`, e);
        showToast(t("{name} couldn't start and was turned off", { name: plugin.name }), findAssetId("CircleXIcon-primary"));
        throw e;
    }
}

export function stopEndcordPlugin(plugin: EndcordPlugin) {
    try {
        plugin.stop?.({
            store: plugin.store,
            logger: new LoggerClass(`Endcord/${plugin.name}`),
            cleanup: () => { }
        });
    } catch (e) {
        console.error(`[Endcord] ${plugin.name}: stop failed`, e);
    }
    runCleanups(plugin.id);
}

export function isEndcordPluginRunning(id: string) {
    return running.has(id);
}
