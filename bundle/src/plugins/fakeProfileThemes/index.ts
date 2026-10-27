/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { after } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command, copy } from "../hooks";

// 3y3: text hidden in invisible tag characters, as Endcord PC's FakeProfileThemes writes it in bios
const encode3y3 = (text: string) => [...text].map(c => String.fromCodePoint(c.codePointAt(0)! + 0xE0000)).join("");

const decode3y3 = (text: string) => [...text].map(c => {
    const code = c.codePointAt(0)!;
    return code >= 0xE0000 && code <= 0xE007F ? String.fromCodePoint(code - 0xE0000) : "";
}).join("");

function themeFromBio(bio?: string): [number, number] | undefined {
    const hidden = decode3y3(bio ?? "");
    const match = hidden.match(/\[#([0-9a-f]{1,6}),#([0-9a-f]{1,6})\]/i);
    return match ? [parseInt(match[1], 16), parseInt(match[2], 16)] : undefined;
}

export default definePlugin({
    id: "endcord.fake-profile-themes",
    name: "FakeProfileThemes",
    description: tx("Allows profile theming by hiding the colors in your bio thanks to invisible 3y3 encoding"),
    icon: "PaintPaletteIcon",
    tags: ["Customisation", "Appearance"],
    settings: {
        nitroFirst: { type: "boolean", label: tx("Prefer Nitro themes"), description: tx("Use a profile's Nitro theme when it has one"), default: true },
    },
    start({ store, cleanup }) {
        const profiles = getStore("UserProfileStore");
        if (typeof profiles?.getUserProfile !== "function") throw new Error("Discord's profile store wasn't found");
        cleanup(
            after("getUserProfile", profiles, (_, profile) => {
                if (!profile || store.nitroFirst && profile.themeColors?.length) return;
                const colors = themeFromBio(profile.bio);
                if (colors) {
                    profile.themeColors = colors;
                    profile.premiumType ??= 2;
                }
            }),
            command({
                name: "profiletheme",
                description: tx("Make the hidden text that gives your profile theme colors"),
                options: [
                    { name: "primary", description: tx("Primary color, like #ff66aa"), required: true },
                    { name: "accent", description: tx("Accent color, like #6644ff"), required: true },
                ],
                run: ({ primary, accent }, ctx) => {
                    const hex = (v: string) => String(v).trim().replace(/^#/, "").toLowerCase();
                    if (![primary, accent].every(c => /^[0-9a-f]{6}$/.test(hex(c)))) {
                        botMessage(ctx.channel.id, t("Colors are written like #ff66aa."));
                        return;
                    }
                    copy(encode3y3(`[#${hex(primary)},#${hex(accent)}]`), t("Copied. Paste it at the end of your About Me."));
                },
            }),
        );
    },
});
