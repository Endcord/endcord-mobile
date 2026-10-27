/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onMessageRow, RowOrder } from "../hooks";
import { cached, lines, setNameColor } from "../shared/rows";

export default definePlugin({
    id: "endcord.custom-user-colors",
    name: "CustomUserColors",
    description: tx("Give any user a custom name color in chat"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaintPaletteIcon",
    tags: ["Appearance", "Customisation"],
    settings: {
        colors: {
            type: "string",
            label: tx("Colors"),
            description: tx("One per line: user ID = color, like 123456789012345678 = #ff66aa"),
            placeholder: "123456789012345678 = #ff66aa",
            multiline: true,
            default: "",
        },
    },
    start({ store, cleanup }) {
        const colors = cached(lines);
        cleanup(onMessageRow("custom-user-colors", (row, message) => {
            const color = colors(store.colors).get(message.author?.id);
            if (color) setNameColor(row, color);
        }, RowOrder.OVERRIDE));
    },
});
