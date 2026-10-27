/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { command } from "../hooks";
import { message } from "../shared/text";

export default definePlugin({
    id: "endcord.starify",
    name: "Starify",
    description: tx("Adds /starify to wrap your message in sparkles ｡ﾟ☆."),
    authors: [ENDCORD_AUTHOR],
    icon: "StarIcon",
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "starify",
            description: tx("Decorate your message with sparkles"),
            options: [message()],
            run: ({ message }) => `✦ﾟ｡⋆ ${message} ⋆｡ﾟ✦`,
        }));
    },
});
