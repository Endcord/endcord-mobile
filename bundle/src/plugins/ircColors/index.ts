/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onMessageRow } from "../hooks";
import { setNameColor } from "../shared/rows";

/** A steady color for each user, like IRC clients */
function ircColor(id: string, lightness: number) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return `hsl(${hash % 360}, 70%, ${lightness}%)`;
}

export default definePlugin({
    id: "endcord.irc-colors",
    name: "IrcColors",
    description: tx("Makes username colors in chat unique, like in IRC clients"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaintPaletteIcon",
    tags: ["Appearance", "Chat"],
    settings: {
        lightness: { type: "number", label: tx("Lightness"), description: tx("Lightness of the colors, from 20 (dark) to 90 (light)"), default: 70, min: 20, max: 90 },
        memberColorsOnly: { type: "boolean", label: tx("Only people without a role color"), description: tx("Keep role colors and only color names that would be the default color"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("irc-colors", (row, message) => {
            const id = message.author?.id;
            if (!id) return;
            if (store.memberColorsOnly && (row.colorString || row.roleColor)) return;
            setNameColor(row, ircColor(id, store.lightness));
        }));
    },
});
