/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's FixImagesQuality: attached pictures in chat load at their own resolution instead of the smaller copy
 * Discord asks its media proxy for. PC changes the link where its image component builds it; on the phone the chat's
 * rows carry the links to the native chat, and this plugin gives a row the link without the size it was shrunk to
 * (pictures larger than 2000×1200 are kept to that, like on PC), or with the setting the original file itself. The
 * pictures' place and size in the chat stay the same. Not ported: PC's full-size picture in the image viewer, which on
 * the phone is a native screen; long-press a picture there to open or save the original.
 */

import { tx } from "@core/i18n";

import { definePlugin, onSettingChange } from "../api";
import { onMessageRow, redrawChannel, RowOrder } from "../hooks";
import { fullResolution, imagesOf, mapStrings, proxiedAttachmentId } from "./links";

/** Messages with pictures seen without finding one of their links, before saying the chat may have changed */
const MESSAGES_BEFORE_WARNING = 25;

export default definePlugin({
    id: "endcord.fix-images-quality",
    name: "FixImagesQuality",
    description: tx("Improves quality of images by loading them at their original resolution. Uses more mobile data."),
    icon: "ImageIcon",
    tags: ["Media", "Appearance"],
    settings: {
        originalImagesInChat: {
            type: "boolean",
            label: tx("Original images in chat"),
            description: tx("Load the original file in chat instead of Discord's optimized copy. Animated pictures always move, large pictures can make the chat slow, and it uses much more data."),
            default: false,
        },
    },
    start({ store, cleanup, logger }) {
        let pictures = 0;
        let found = false;
        let warned = false;
        cleanup(
            onSettingChange(store, () => redrawChannel()),
            onMessageRow("fix-images-quality", (row, message) => {
                const images = imagesOf(message);
                if (!images.size) return;
                let matched = 0;
                const relink = (text: string) => {
                    const id = proxiedAttachmentId(text);
                    const info = id ? images.get(id) : undefined;
                    if (!info) return text;
                    matched++;
                    return fullResolution(text, info, store.originalImagesInChat);
                };
                const budget = { left: 600 };
                for (const key of Object.keys(row)) {
                    // The message's text, where links are only text
                    if (key === "content" || key === "__proto__") continue;
                    const value = row[key];
                    const next = typeof value === "string" ? relink(value) : mapStrings(value, relink, budget);
                    if (next !== value) row[key] = next;
                }
                if (matched) found = true;
                else if (!found && !warned && ++pictures >= MESSAGES_BEFORE_WARNING) {
                    warned = true;
                    logger.warn("No picture links were found in Discord's chat rows; pictures load at Discord's size");
                }
            }, RowOrder.ADJUST),
        );
    },
});
