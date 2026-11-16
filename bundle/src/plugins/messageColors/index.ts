/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's MessageColors: color codes in messages (#FF0042, #39f, rgb(), rgba(), hsl()) are shown with their
 * color. PC can draw any color, as the text's color, its background or a block beside it. Discord's chat on the phone
 * is drawn natively from the message's text, where only emoji bring color, so here PC's "block nearby" is the one way
 * left: the colored square emoji closest to the color, beside the code, on the side chosen. Links, mentions and code
 * keep their text, as on PC.
 */

import { tx } from "@core/i18n";

import { definePlugin, onSettingChange } from "../api";
import { onMessageRow, redrawChannel, RowOrder } from "../hooks";
import { type BlockSide, mapText, withSquares } from "./colors";

export default definePlugin({
    id: "endcord.message-colors",
    name: "MessageColors",
    description: tx("Shows a colored square beside color codes like #FF0042 in messages: the closest of the colored square emoji, as the phone's chat can't draw other colors."),
    icon: "PaintPaletteIcon",
    tags: ["Appearance", "Chat"],
    settings: {
        enableShortHexCodes: { type: "boolean", label: tx("Short hex codes"), description: tx("Enable 3 char hex-code like #39f"), default: true },
        blockView: {
            type: "select",
            label: tx("Where to display colored block"),
            default: "right",
            options: [
                { label: tx("Right side"), value: "right" },
                { label: tx("Left side"), value: "left" },
                { label: tx("Both sides"), value: "both" },
            ],
        },
    },
    start({ store, cleanup }) {
        cleanup(
            onMessageRow("message-colors", (row, message) => {
                if (!Array.isArray(row.content) || typeof message.content !== "string" || !/#|rgb|hsl/i.test(message.content)) return;
                const side = (["right", "left", "both"].includes(store.blockView) ? store.blockView : "right") as BlockSide;
                row.content = mapText(row.content, text => withSquares(text, store.enableShortHexCodes, side));
            }, RowOrder.ADJUST),
            onSettingChange(store, () => redrawChannel()),
        );
    },
});
