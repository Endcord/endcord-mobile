/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { extendProfileBadges, linkedBadge } from "../profileBadges";
import { remoteJson } from "../remote";
import { redrawProfiles } from "../shared/profiles";

interface GlobalBadge {
    mod: string;
    badge: string;
    tooltip: string;
}

export default definePlugin({
    id: "endcord.global-badges",
    name: "GlobalBadges",
    description: tx("Adds global badges from other client mods"),
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
