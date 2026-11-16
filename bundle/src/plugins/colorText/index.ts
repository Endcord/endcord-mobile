/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ColorText: /color sends your message in color, written as the colored code block Discord can show
 * (an "ansi" one), with PC's colors, backgrounds and styles. It's sent as you, only when you send the command.
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { command } from "../hooks";
import { BACKGROUNDS, colorize, COLORS, STYLES } from "./colorize";

const choices = (names: readonly string[]) => names.map(name => ({ name, value: name }));

export default definePlugin({
    id: "endcord.color-text",
    name: "ColorText",
    description: tx("/color writes your message in color, using the colored code blocks Discord can show."),
    icon: "PaintPaletteIcon",
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "color",
            description: tx("Send your message in color"),
            options: [
                { name: "message", description: tx("What to write"), required: true },
                { name: "color", description: tx("The color of the text"), required: true, choices: choices(Object.keys(COLORS)) },
                { name: "background", description: tx("A color behind the text"), choices: choices(Object.keys(BACKGROUNDS)) },
                { name: "style", description: tx("Bold or underlined"), choices: choices(Object.keys(STYLES)) },
            ],
            run: ({ message, color, background, style }) => colorize(String(message ?? ""), String(color ?? "white"), background, style),
        }));
    },
});
