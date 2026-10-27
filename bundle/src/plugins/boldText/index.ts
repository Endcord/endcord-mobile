/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { command } from "../hooks";
import { message, toBold } from "../shared/text";

export default definePlugin({
    id: "endcord.bold-text",
    name: "BoldText",
    description: tx("/bold turns your message into 𝐮𝐧𝐢𝐜𝐨𝐝𝐞 bold (works where markdown can't)."),
    authors: [ENDCORD_AUTHOR],
    icon: "LettersIcon",
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "bold",
            description: tx("Make your text unicode-bold"),
            options: [message()],
            run: ({ message }) => toBold(message),
        }));
    },
});
