/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord's built-in plugins. Endcord starts with only their manifest (names, descriptions, tags); a plugin's code is
 * loaded the first time it starts or its settings open, so the plugins that are off cost nothing at startup.
 */

import type { PluginInstanceInternal } from "@lib/addons/plugins/types";
import { createElement } from "react";

import { ENDCORD_AUTHOR, EndcordPlugin, isEndcordPluginRunning, startEndcordPlugin, stopEndcordPlugin } from "./api";
import { groups, manifest, PluginInfo } from "./manifest";

const loaded = new Map<string, EndcordPlugin<any>>();

let descriptions: Record<string, string> | undefined;
/** English descriptions, read the first time the plugin list shows one */
const descriptionOf = (id: string) => (descriptions ??= require("./descriptions.json") as Record<string, string>)[id] ?? "";

/** A plugin's code, loaded with the rest of its group the first time it's needed */
export function loadEndcordPlugin(id: string): EndcordPlugin<any> {
    const cached = loaded.get(id);
    if (cached) return cached;
    const info = manifest.find(p => p.id === id);
    if (!info) throw new Error(`No Endcord plugin is called ${id}`);
    const exported = groups[info.group]().default;
    for (const plugin of Array.isArray(exported) ? exported : [exported]) loaded.set(plugin.id, plugin);
    const plugin = loaded.get(id);
    if (!plugin) throw new Error(`${info.group} doesn't define ${id}; regenerate the plugin manifest`);
    return plugin;
}

/** How many plugins have had their code loaded, for the self-test to check that startup loads none it needn't */
export const loadedPluginCount = () => loaded.size;

/** Every built-in plugin, loading all of their code (for the self-test) */
export function getEndcordPlugins(): EndcordPlugin<any>[] {
    return sorted().map(p => loadEndcordPlugin(p.id));
}

/** Endcord PC's popular plugins first, in its order, then the others by name */
function sorted(): PluginInfo[] {
    const popular = manifest.filter(p => p.popular != null).sort((a, b) => a.popular! - b.popular!);
    const others = manifest.filter(p => p.popular == null).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    return [...popular, ...others];
}

/** Endcord plugins as core plugins of the plugin manager, which handles enabling and settings storage */
export function getEndcordCorePlugins(): Record<string, { default: PluginInstanceInternal; preenabled: boolean; }> {
    return Object.fromEntries(sorted().map(info => [info.id, {
        preenabled: false,
        default: {
            manifest: {
                id: info.id,
                spec: 3,
                type: "plugin",
                version: "1.0.0",
                main: "",
                display: {
                    name: info.name,
                    get description() {
                        return descriptionOf(info.id);
                    },
                    authors: [ENDCORD_AUTHOR],
                },
                extras: {
                    endcord: true,
                    popular: info.popular,
                    icon: info.icon,
                    tags: info.tags,
                },
            },
            start() {
                // The plugin manager doesn't wait for this; failures turn the plugin off and show a toast
                Promise.resolve()
                    .then(() => startEndcordPlugin(loadEndcordPlugin(info.id)))
                    .catch(() => {
                        import("@lib/addons/plugins").then(({ disablePlugin, isPluginEnabled }) => {
                            if (isPluginEnabled(info.id)) disablePlugin(info.id);
                        });
                    });
            },
            stop() {
                // A plugin that never started has nothing to stop, and its code needn't be loaded for that
                if (isEndcordPluginRunning(info.id)) stopEndcordPlugin(loadEndcordPlugin(info.id));
            },
            SettingsComponent: info.hasSettings
                ? () => createElement(require("./ui/PluginSettings").default, { plugin: loadEndcordPlugin(info.id) })
                : undefined,
        } as PluginInstanceInternal,
    }]));
}
