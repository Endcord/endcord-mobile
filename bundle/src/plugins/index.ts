/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginInstanceInternal } from "@lib/addons/plugins/types";
import { createElement } from "react";

import Actions from "./actions";
import { EndcordPlugin, startEndcordPlugin, stopEndcordPlugin } from "./api";
import ClearURLs from "./clearUrls";
import Compose from "./compose";
import CustomProfile from "./customProfile";
import Effects from "./effects";
import FakeMute from "./fakeMute";
import FakeNitro from "./fakeNitro";
import Filters from "./filters";
import HideEndcord from "./hideEndcord";
import Lookup from "./lookup";
import MessageLogger from "./messageLogger";
import Notify from "./notify";
import Oneko from "./oneko";
import PlatformIndicators from "./platformIndicators";
import Presence from "./presence";
import Profiles from "./profiles";
import RelationshipNotifier from "./relationshipNotifier";
import Rows from "./rows";
import Schedule from "./schedule";
import SilentTyping from "./silentTyping";
import SmoothType from "./smoothType";
import Social from "./social";
import Text from "./text";
import ThemeLibrary from "./themeLibrary";
import Tools from "./tools";
import ViewIcons from "./viewIcons";
import Voice from "./voice";

/** The rest of Endcord PC's plugins that work on mobile, grouped by what they hook into */
const others: EndcordPlugin<any>[] = [
    ClearURLs,
    ...Text, ...Lookup, ...Compose, ...Filters, ...Notify, ...Actions, ...Schedule, ...Rows,
    ...Presence, ...Effects, ...Voice, ...Profiles, ...Tools, ...Social,
].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

/** Endcord's built-in plugins: Endcord PC's popular list in its order, then the others by name */
const plugins: EndcordPlugin<any>[] = [
    CustomProfile,
    MessageLogger,
    HideEndcord,
    FakeNitro,
    SmoothType,
    ViewIcons,
    ThemeLibrary,
    Oneko,
    PlatformIndicators,
    RelationshipNotifier,
    SilentTyping,
    FakeMute,
    ...others,
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
                    tags: plugin.tags,
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
