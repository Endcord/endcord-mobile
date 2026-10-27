/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { after } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { remoteJson } from "../remote";
import { redrawProfiles } from "../shared/profiles";

export default definePlugin({
    id: "endcord.usrbg",
    name: "USRBG",
    description: tx("Displays user banners from USRBG, allowing anyone to get a banner without Nitro"),
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
                if (typeof etag !== "string" || !etag) return url;
                // The list is someone else's: a banner only comes from an https address it names
                if (typeof data?.endpoint !== "string" || !data.endpoint.startsWith("https://")) return url;
                return `${data.endpoint}/${data.bucket ?? ""}/${data.prefix ?? ""}${id}?${encodeURIComponent(etag)}`;
            }),
        );
    },
});
