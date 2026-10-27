/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId, onAction } from "../common";

export default definePlugin({
    id: "endcord.no-profile-themes",
    name: "NoProfileThemes",
    description: tx("Completely removes Nitro profile themes from everyone but yourself"),
    icon: "PaintPaletteIcon",
    tags: ["Appearance"],
    start({ cleanup }) {
        const strip = (profile: any) => profile && { ...profile, theme_colors: undefined, themeColors: undefined };
        cleanup(onAction<{ user?: { id: string; }; user_profile?: any; guild_member_profile?: any; }>("USER_PROFILE_FETCH_SUCCESS", payload => {
            if (!payload.user || payload.user.id === currentUserId()) return;
            return { user_profile: strip(payload.user_profile), guild_member_profile: strip(payload.guild_member_profile) };
        }));
    },
});
