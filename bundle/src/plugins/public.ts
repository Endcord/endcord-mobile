/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord's built-in plugins as bunny.endcord, like Endcord PC's Endcord.Plugins: for DevTools and the self-test.
 * Only the manifest is loaded with it; everything else is required when used, so it costs nothing at startup.
 */

import { manifest } from "./manifest";

export { manifest };

/** A plugin by ID, loading its code */
export const getPlugin = (id: string) => require("./index").loadEndcordPlugin(id);
/** Every plugin, loading all of their code */
export const getPlugins = () => require("./index").getEndcordPlugins();
export const start = (plugin: any) => require("./api").startEndcordPlugin(plugin);
export const stop = (plugin: any) => require("./api").stopEndcordPlugin(plugin);
export const isRunning = (id: string) => require("./api").isEndcordPluginRunning(id);

/** What the running plugins have registered, by kind: a plugin that leaves any of these behind when it stops leaks */
export function registrations() {
    const { registeredSections } = require("@ui/settings");
    return {
        ...require("./hooks").hookCounts(),
        ...require("./common").registryCounts(),
        fluxInterceptors: require("@lib/api/flux").interceptorCount(),
        commands: require("@lib/api/commands").registeredCommandCount(),
        settingsRows: Object.values(registeredSections as Record<string, unknown[]>).reduce((n, rows) => n + rows.length, 0),
    };
}

/** The warnings and errors plugins logged since the app started: one plugin's, or every plugin's by ID */
export const logs = (id?: string) => id ? require("./api").pluginLogsOf(id) : require("./api").allPluginLogs();

/** The plugins' registered callbacks and commands, for the self-test to exercise each one */
export const hooks = () => ({ ...require("./hooks").hookRegistries(), commands: require("@lib/api/commands").registeredCommands() });
