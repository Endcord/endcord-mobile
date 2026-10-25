/*
 * Endcord for Android
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginInstanceInternal } from "@lib/addons/plugins/types";
import { createElement } from "react";

import { EndcordPlugin, startEndcordPlugin, stopEndcordPlugin } from "./api";
import SilentTyping from "./silentTyping";

/** Endcord's built-in plugins, in the order of Endcord PC's popular list, then by name */
const plugins: EndcordPlugin<any>[] = [
    SilentTyping,
];

export function getEndcordPlugins(): EndcordPlugin<any>[] {
    return plugins;
}

/** Endcord plugins as core plugins of the plugin manager, which handles enabling and settings storage */
export function getEndcordCorePlugins(): Record<string, { default: PluginInstanceInternal; preenabled: boolean; }> {
    return Object.fromEntries(plugins.map(plugin => [plugin.id, {
        preenabled: false,
        default: {
            manifest: {
                id: plugin.id,
                spec: 3,
                type: "plugin",
                version: "1.0.0",
                main: "",
                display: {
                    name: plugin.name,
                    description: plugin.description,
                    authors: plugin.authors,
                },
                extras: {
                    endcord: true,
                    popular: plugin.popular,
                    icon: plugin.icon,
                },
            },
            start() {
                // The plugin manager doesn't wait for this; failures turn the plugin off and show a toast
                startEndcordPlugin(plugin).catch(() => {
                    import("@lib/addons/plugins").then(({ disablePlugin, isPluginEnabled }) => {
                        if (isPluginEnabled(plugin.id)) disablePlugin(plugin.id);
                    });
                });
            },
            stop() {
                stopEndcordPlugin(plugin);
            },
            SettingsComponent: plugin.settings || plugin.SettingsComponent
                ? () => createElement(require("./ui/PluginSettings").default, { plugin })
                : undefined,
        } as PluginInstanceInternal,
    }]));
}
