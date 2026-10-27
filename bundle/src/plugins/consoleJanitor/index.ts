/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";

export default definePlugin({
    id: "endcord.console-janitor",
    name: "ConsoleJanitor",
    description: tx("Turns off Discord's console logging, which saves work on slower phones"),
    authors: [ENDCORD_AUTHOR],
    icon: "TrashIcon",
    tags: ["Utility"],
    settings: {
        keepWarnings: { type: "boolean", label: tx("Keep warnings"), description: tx("Still log warnings, which help when reporting a problem"), default: true },
    },
    start({ store, cleanup }) {
        const original = { log: console.log, info: console.info, debug: console.debug, warn: console.warn };
        const quiet = () => { };
        console.log = console.info = console.debug = quiet;
        if (!store.keepWarnings) console.warn = quiet;
        cleanup(() => Object.assign(console, original));
    },
});
