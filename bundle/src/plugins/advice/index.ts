/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.advice",
    name: "Advice",
    description: tx("Send a random piece of advice with /advice"),
    icon: "ChatIcon",
    tags: ["Fun"],
    start: only({
        name: "advice",
        description: tx("Send a random piece of advice"),
        run: async () => `💡 ${(await json(`https://api.adviceslip.com/advice?t=${Date.now()}`))?.slip?.advice}`,
    }),
});
