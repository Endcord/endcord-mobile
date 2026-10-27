/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { hex } from "../crypto";
import { answer, only, randomBytes } from "../shared/utility";

export default definePlugin({
    id: "endcord.color-info",
    name: "ColorInfo",
    description: tx("See a color's RGB and HSL values, or get a random one, with /color"),
    icon: "PaintPaletteIcon",
    tags: ["Utility"],
    start: only({
        name: "color",
        description: tx("A color's values; leave it out for a random color"),
        options: [{ name: "hex", description: tx("Such as #5865F2") }],
        run: ({ hex: input }, ctx) => {
            let value = String(input ?? "").trim().replace(/^#/, "");
            if (/^[\da-f]{3}$/i.test(value)) value = [...value].map(c => c + c).join("");
            if (!input) value = hex(randomBytes(3));
            if (!/^[\da-f]{6}$/i.test(value)) return answer(ctx, t("That isn't a hex color; try something like #5865F2."));
            const [r, g, b] = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
            const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2, d = max - min;
            const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
            const hue = !d ? 0 : max === r / 255 ? 60 * ((g - b) / 255 / d % 6) : max === g / 255 ? 60 * ((b - r) / 255 / d + 2) : 60 * ((r - g) / 255 / d + 4);
            answer(ctx, `**#${value.toUpperCase()}**\nRGB ${r}, ${g}, ${b}\nHSL ${Math.round((hue + 360) % 360)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%\nhttps://singlecolorimage.com/get/${value}/96x96`);
        },
    }),
});
