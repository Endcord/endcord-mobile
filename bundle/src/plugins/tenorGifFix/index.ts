/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { before } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";

/** Tenor's video previews to the GIF they come from */
function tenorGif(url: string): string | undefined {
    const path = url.split("/");
    const index = path.findIndex(part => part.endsWith(".tenor.com"));
    if (index === -1) return;
    const [host, id, file] = path.slice(index, index + 3);
    if (!host || !id || !file) return;
    return `https://${host}/${id.slice(0, -2)}AC/${file.split(".")[0]}.gif`;
}

export default definePlugin({
    id: "endcord.tenor-gif-fix",
    name: "TenorGifFix",
    description: tx("Saves Tenor GIFs as real GIFs instead of videos"),
    authors: [ENDCORD_AUTHOR],
    icon: "GifIcon",
    tags: ["Media"],
    start({ cleanup }) {
        const media = findByProps("downloadMediaAsset");
        if (typeof media?.downloadMediaAsset !== "function") throw new Error("Discord's media saver wasn't found");
        cleanup(before("downloadMediaAsset", media, (args: any[]) => {
            const gif = typeof args[0] === "string" ? tenorGif(args[0]) : undefined;
            if (gif) {
                args[0] = gif;
                // An image, not a video
                args[1] = 1;
            }
        }));
    },
});
