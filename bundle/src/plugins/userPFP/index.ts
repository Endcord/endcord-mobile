/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { after } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { remoteJson } from "../remote";
import { redrawProfiles } from "../shared/profiles";

export default definePlugin({
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
            // The list is someone else's: anything but an https link is left out rather than given to Discord
            if (typeof url !== "string" || !url.startsWith("https://")) return;
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
