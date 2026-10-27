/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { before } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { onAction } from "../common";

export default definePlugin({
    id: "endcord.declutter",
    name: "Declutter",
    description: tx("Cleans up Discord by removing profile effects and avatar decorations"),
    icon: "TrashIcon",
    tags: ["Appearance"],
    settings: {
        removeProfileEffect: { type: "boolean", label: tx("Profile effects"), description: tx("Remove profile animations"), default: true },
        removeAvatarDecorations: { type: "boolean", label: tx("Avatar decorations"), description: tx("Remove avatar decorations"), default: true },
    },
    start({ store, cleanup }) {
        cleanup(onAction<{ user_profile?: any; guild_member_profile?: any; }>("USER_PROFILE_FETCH_SUCCESS", payload => {
            if (!store.removeProfileEffect) return;
            const strip = (p: any) => p && { ...p, profile_effect: null };
            return { user_profile: strip(payload.user_profile), guild_member_profile: strip(payload.guild_member_profile) };
        }));
        const images = findByProps("getAvatarDecorationURL");
        if (typeof images?.getAvatarDecorationURL === "function") {
            cleanup(before("getAvatarDecorationURL", images, (args: any[]) => {
                if (store.removeAvatarDecorations && args[0]) args[0] = { ...args[0], avatarDecoration: null };
            }));
        }
    },
});
