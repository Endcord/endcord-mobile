/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { recordPluginStart } from "@core/timings";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
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
    /** Position in Endcord PC's list of popular plugins, which are listed first */
    popular?: number;
    /** Named asset shown next to the name */
    icon?: string;
    /** Endcord PC's tags, for the plugin page's filters */
    tags?: PluginTag[];
    /** On until the user turns it off, also for those who had Endcord before the plugin was added */
    enabledByDefault?: boolean;
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

export interface PluginLogEntry {
    level: "warn" | "error";
    message: string;
    time: number;
}

const MAX_LOG_ENTRIES = 20;
const pluginLogs = new Map<string, PluginLogEntry[]>();

/** The warnings and errors a plugin logged since the app started, newest last */
export const pluginLogsOf = (id: string): readonly PluginLogEntry[] => pluginLogs.get(id) ?? [];
export const allPluginLogs = () => Object.fromEntries(pluginLogs);

const describeArg = (arg: unknown) => {
    if (arg instanceof Error) return arg.message;
    if (typeof arg === "string") return arg;
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
    }
};

/**
 * Discord's logger, which also keeps the plugin's warnings and errors: Discord's own doesn't hand them back, and a
 * plugin that can't find what it patches says so with a warning
 */
function pluginLogger(plugin: EndcordPlugin): Logger {
    const base: Logger = new LoggerClass(`Endcord/${plugin.name}`);
    const keep = (level: PluginLogEntry["level"]) => (...args: unknown[]) => {
        base[level](...args);
        let list = pluginLogs.get(plugin.id);
        if (!list) pluginLogs.set(plugin.id, list = []);
        list.push({ level, message: args.map(describeArg).join(" ").slice(0, 500), time: Date.now() });
        if (list.length > MAX_LOG_ENTRIES) list.shift();
    };
    return {
        log: (...args) => base.log(...args),
        info: (...args) => base.info(...args),
        time: (...args) => base.time(...args),
        trace: (...args) => base.trace(...args),
        verbose: (...args) => base.verbose(...args),
        warn: keep("warn"),
        error: keep("error"),
    };
}

/** Fills in settings added after the plugin's storage was first created */
async function loadStore(plugin: EndcordPlugin) {
    await awaitStorage(plugin.store);
    for (const [key, def] of Object.entries(plugin.settings ?? {})) {
        const value = (plugin.store as any)[key];
        if (value === undefined || typeof value !== typeof def.default) (plugin.store as any)[key] = def.default;
    }
}

function runCleanup(id: string, fn: () => unknown) {
    try {
        fn();
    } catch (e) {
        console.error(`[Endcord] ${id}: cleanup failed`, e);
    }
}

function runCleanups(id: string) {
    const fns = running.get(id);
    running.delete(id);
    // Last registered first, so patches stacked on each other come off in order
    for (const fn of fns?.reverse() ?? []) runCleanup(id, fn);
}

export async function startEndcordPlugin(plugin: EndcordPlugin) {
    if (running.has(plugin.id)) return;

    const cleanups: Array<() => unknown> = [];
    running.set(plugin.id, cleanups);
    // Turned off while it was still starting (waiting for its storage or the network): whatever it sets up from then
    // on is undone right away, so nothing keeps running for a plugin that shows as off
    const stopped = () => running.get(plugin.id) !== cleanups;
    const ctx: PluginContext<any> = {
        store: plugin.store,
        logger: pluginLogger(plugin),
        cleanup: (...fns) => {
            for (const fn of fns) {
                if (typeof fn !== "function") continue;
                if (stopped()) runCleanup(plugin.id, fn);
                else cleanups.push(fn);
            }
        }
    };

    try {
        await loadStore(plugin);
        // From after its storage loaded: all plugins load theirs at once, so that wait is shared, not this plugin's
        const started = Date.now();
        await plugin.start(ctx);
        if (stopped()) return;
        recordPluginStart(plugin.id, Date.now() - started);
        plugin.error = undefined;
    } catch (e) {
        console.error(`[Endcord] ${plugin.name} failed to start`, e);
        // Nothing to report for a plugin that was turned off meanwhile
        if (stopped()) return;
        plugin.error = e;
        runCleanups(plugin.id);
        showToast(t("{name} couldn't start and was turned off", { name: plugin.name }), findAssetId("CircleXIcon-primary"));
        throw e;
    }
}

export function stopEndcordPlugin(plugin: EndcordPlugin) {
    try {
        plugin.stop?.({
            store: plugin.store,
            logger: pluginLogger(plugin),
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
