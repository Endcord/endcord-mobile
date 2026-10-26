/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Profile plugins: avatars, banners, badges and theme colors from the services Endcord PC uses.
 */

import { t, tx } from "@core/i18n";
import { after } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { addMessageAction, botMessage, command, copy, redrawChannel } from "../hooks";
import { extendProfileBadges, linkedBadge } from "../profileBadges";
import { remoteJson } from "../remote";

/** What shows avatars, banners and badges draws them again, after the data for them loaded */
function redrawProfiles() {
    for (const name of ["UserStore", "UserProfileStore"]) {
        try {
            getStore(name)?.emitChange?.();
        } catch { }
    }
    redrawChannel();
}

const UserPFP = definePlugin({
    id: "endcord.userpfp",
    name: "UserPFP",
    description: tx("Allows you to use an animated avatar without Nitro"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserCircleIcon",
    tags: ["Customisation", "Appearance"],
    start({ cleanup, logger }) {
        const icons = findByProps("getUserAvatarURL", "getUserAvatarSource") ?? findByProps("getUserAvatarURL");
        if (typeof icons?.getUserAvatarURL !== "function") throw new Error("Discord's avatar helpers weren't found");
        // Loaded the first time an avatar is drawn, so a slow or missing connection doesn't hold up Discord's start
        const avatars = remoteJson("https://userpfp.github.io/UserPFP/source/data.json", {
            parse: (data): Record<string, string> => data?.avatars ?? {},
            onError: e => logger.warn("Couldn't load UserPFP's avatars", e),
        });
        const custom = (user: any, animated?: boolean) => {
            const url = user?.id && avatars.get()?.[user.id];
            if (!url) return;
            return !animated && /\.gif(\?|$)/.test(url) ? url.replace(/\.gif(\?|$)/, ".png$1") : url;
        };
        cleanup(
            avatars.clear,
            avatars.onLoad(redrawProfiles),
            after("getUserAvatarURL", icons, ([user, animated], url) => custom(user, animated) ?? url),
        );
        if (typeof icons.getUserAvatarSource === "function") {
            cleanup(after("getUserAvatarSource", icons, ([user, animated], source) => {
                const url = custom(user, animated);
                return url ? { uri: url } : source;
            }));
        }
    },
});

const USRBG = definePlugin({
    id: "endcord.usrbg",
    name: "USRBG",
    description: tx("Displays user banners from USRBG, allowing anyone to get a banner without Nitro"),
    authors: [ENDCORD_AUTHOR],
    icon: "ImageIcon",
    tags: ["Customisation", "Appearance"],
    settings: {
        nitroFirst: { type: "boolean", label: tx("Prefer Nitro banners"), description: tx("Show a user's Nitro banner instead of their USRBG banner when they have both"), default: true },
    },
    start({ store, cleanup, logger }) {
        const banners = findByProps("getUserBannerURL");
        if (typeof banners?.getUserBannerURL !== "function") throw new Error("Discord's banner helpers weren't found");
        // Some 6 MB: loaded the first time a banner is drawn rather than at startup, and only again when it changed
        const list = remoteJson("https://usrbg.is-hardly.online/users", {
            parse: (json): { endpoint?: string; bucket?: string; prefix?: string; users?: Record<string, string>; } => json ?? {},
            onError: e => logger.warn("Couldn't load USRBG's banners", e),
        });
        cleanup(
            list.clear,
            list.onLoad(redrawProfiles),
            after("getUserBannerURL", banners, ([user], url) => {
                const id = user?.id;
                if (!id || store.nitroFirst && url) return url;
                const data = list.get();
                const etag = data?.users?.[id];
                if (!etag) return url;
                return `${data.endpoint}/${data.bucket}/${data.prefix}${id}?${etag}`;
            }),
        );
    },
});

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

const FakeProfileThemes = definePlugin({
    id: "endcord.fake-profile-themes",
    name: "FakeProfileThemes",
    description: tx("Allows profile theming by hiding the colors in your bio thanks to invisible 3y3 encoding"),
    authors: [ENDCORD_AUTHOR],
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

interface GlobalBadge {
    mod: string;
    badge: string;
    tooltip: string;
}

const GlobalBadges = definePlugin({
    id: "endcord.global-badges",
    name: "GlobalBadges",
    description: tx("Adds global badges from other client mods"),
    authors: [ENDCORD_AUTHOR],
    icon: "MedalIcon",
    tags: ["Appearance"],
    settings: {
        showModStyle: {
            type: "select",
            label: tx("Show the mod's name"),
            default: "prefix",
            options: [
                { label: tx("Before the badge's name"), value: "prefix" },
                { label: tx("After the badge's name"), value: "suffix" },
                { label: tx("Don't show it"), value: "none" },
            ],
        },
    },
    start({ store, cleanup, logger }) {
        // Almost 2 MB: loaded the first time a profile's badges are drawn, and only again when it changed
        const list = remoteJson("https://badges.equicord.org/users", {
            parse: (json): Record<string, GlobalBadge[]> => json?.users ?? {},
            onError: e => logger.warn("Couldn't load the global badges", e),
        });
        cleanup(list.clear, list.onLoad(redrawProfiles));
        cleanup(extendProfileBadges("global-badges", (userId, badges) => {
            const extra = (list.get()?.[userId] || []).filter((b: GlobalBadge) => b?.badge && /^https:\/\//.test(b.badge) && b.mod?.toLowerCase() !== "endcord");
            if (!extra.length) return badges;
            return [...badges, ...extra.map((b: GlobalBadge) => {
                const label = store.showModStyle === "prefix" ? `${b.mod} - ${b.tooltip}` : store.showModStyle === "suffix" ? `${b.tooltip} - ${b.mod}` : b.tooltip;
                return linkedBadge(`gb-${userId}-${encodeURIComponent(`${b.mod}:${b.badge}`)}`, label, b.badge);
            })];
        }));
    },
});

const CopyProfileColors = definePlugin({
    id: "endcord.copy-profile-colors",
    name: "CopyProfileColors",
    description: tx("Copy the profile theme colors of a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaintPaletteIcon",
    tags: ["Utility", "Customisation"],
    start({ cleanup }) {
        const colorsOf = (userId: string): number[] | undefined => getStore("UserProfileStore")?.getUserProfile?.(userId)?.themeColors;
        const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
        cleanup(addMessageAction({
            key: "copy-profile-colors",
            icon: "PaintPaletteIcon",
            label: () => t("Copy Profile Colors"),
            visible: message => !!colorsOf(message.author?.id)?.length,
            onPress: message => {
                const [primary, accent] = colorsOf(message.author.id)!;
                copy(t("Primary: {primary}, Accent: {accent}", { primary: hex(primary), accent: hex(accent ?? primary) }));
            },
        }));
    },
});

export default [UserPFP, USRBG, FakeProfileThemes, GlobalBadges, CopyProfileColors];
