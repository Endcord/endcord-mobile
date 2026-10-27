/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { command } from "../hooks";
import { STYLES } from "../shared/messages";

export default definePlugin({
    id: "endcord.translate-plus",
    name: "Translate+",
    description: tx("Rewrite your text in fun styles (small caps, upside down, fraktur, pirate...) with /translateplus"),
    authors: [ENDCORD_AUTHOR],
    icon: "LanguageIcon",
    tags: ["Fun", "Chat"],
    start({ cleanup }) {
        cleanup(command({
            name: "translateplus",
            description: tx("Rewrite your text in a fun style"),
            options: [
                { name: "style", description: tx("The style"), required: true, choices: Object.keys(STYLES).map(name => ({ name, value: name })) },
                { name: "text", description: tx("Your message"), required: true },
            ],
            run: ({ style, text }) => (STYLES[style] ?? (s => s))(String(text)),
        }));
    },
});
