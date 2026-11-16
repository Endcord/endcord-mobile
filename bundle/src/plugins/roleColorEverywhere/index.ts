/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's RoleColorEverywhere, the part a phone can have: chat messages tinted with their author's top role
 * color, as much as "Intensity" says (PC's "Color chat messages based on the author's role color", mixed into the
 * text's own color the same way). PC also colors mentions, the member list's role headers, voice channel members,
 * reactions and poll results. On the phone, mentions are drawn by the native chat, which gives them no color of their
 * own, and the other places are screens whose insides aren't known well enough to change them safely, so they stay as
 * Discord draws them. A message that failed to send, or one another plugin has colored (like a deleted message
 * MessageLogger keeps), keeps its color.
 */

import { tx } from "@core/i18n";
import { resolveSemanticColor, semanticColorOf } from "@ui/color";

import { definePlugin, onSettingChange } from "../api";
import { getStore } from "../common";
import { getChannel, nativeColor, onMessageRow, redrawChannel, RowOrder } from "../hooks";
import { fromPacked, mixColors, parseHex, type Rgb, toHex } from "./mix";

/** The text's own color in the theme in use, as the chat takes it; worked out again when the theme changes */
let base: { theme: unknown; rgb: Rgb; packed: number; } | undefined;

function textColor(): typeof base {
    const theme = getStore("ThemeStore")?.theme;
    if (base?.theme === theme) return base;
    let packed: number | undefined;
    try {
        const token = semanticColorOf("TEXT_DEFAULT", "TEXT_NORMAL", "TEXT_PRIMARY");
        packed = token ? nativeColor(resolveSemanticColor(token)) : undefined;
    } catch {
        packed = undefined;
    }
    const rgb = fromPacked(packed);
    base = rgb && packed !== undefined ? { theme, rgb, packed } : undefined;
    return base;
}

const mixes = new Map<string, number | undefined>();

export default definePlugin({
    id: "endcord.role-color-everywhere",
    name: "RoleColorEverywhere",
    description: tx("Tints the text of chat messages with the author's top role color."),
    icon: "PaintPaletteIcon",
    tags: ["Appearance"],
    settings: {
        messageSaturation: { type: "number", label: tx("Intensity"), description: tx("Intensity of message coloring."), default: 30, min: 0, max: 100 },
    },
    start({ store, cleanup }) {
        if (!textColor()) throw new Error("Discord's text color wasn't found");
        cleanup(
            () => {
                mixes.clear();
                base = undefined;
            },
            onMessageRow("role-color-everywhere", (row, message) => {
                const saturation = Math.round(store.messageSaturation);
                if (!(saturation > 0) || message.state === "SEND_FAILED" || !message.author?.id) return;
                const text = textColor();
                // Colored by Discord or another plugin already: that color says something
                if (!text || row.textColor != null && row.textColor !== text.packed) return;
                const guildId = getChannel(message.channel_id)?.guild_id;
                if (!guildId) return;
                // As on PC, the member's role color; someone without one keeps the text's own
                const role = parseHex(getStore("GuildMemberStore")?.getMember?.(guildId, message.author.id)?.colorString) ?? parseHex(row.colorString);
                if (!role) return;
                const key = `${toHex(role)}|${toHex(text.rgb)}|${saturation}`;
                if (!mixes.has(key)) {
                    if (mixes.size > 500) mixes.clear();
                    mixes.set(key, nativeColor(toHex(mixColors(role, text.rgb, saturation))));
                }
                const color = mixes.get(key);
                if (color !== undefined) row.textColor = color;
            }, RowOrder.ADJUST),
            onSettingChange(store, () => redrawChannel()),
        );
    },
});
