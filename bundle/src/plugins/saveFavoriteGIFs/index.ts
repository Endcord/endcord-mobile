/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { botMessage, command, share } from "../hooks";

export default definePlugin({
    id: "endcord.save-favorite-gifs",
    name: "SaveFavoriteGIFs",
    description: tx("Export favorited GIF urls"),
    authors: [ENDCORD_AUTHOR],
    icon: "GifIcon",
    tags: ["Media"],
    start({ cleanup }) {
        cleanup(command({
            name: "exportgifs",
            description: tx("Share the links of all your favorite GIFs"),
            run: async (_, ctx) => {
                const settings = getStore("UserSettingsProtoStore");
                const gifs = settings?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs ?? settings?.getFrecencySettings?.()?.favoriteGifs?.gifs ?? {};
                const urls = Object.keys(gifs);
                if (!urls.length) {
                    botMessage(ctx.channel.id, t("You have no favorite GIFs, or Discord hasn't loaded them yet."));
                    return;
                }
                await share(urls.join("\n"), t("Favorite GIFs"));
            },
        }));
    },
});
