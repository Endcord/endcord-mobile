/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's BetterGifLoad: the GIF picker loads its GIFs at the quality picked. PC rewrites the links where
 * Discord's GIF picker store and its GIF items build them; on the phone the store's results and categories, and the
 * favorites' thumbnails, are given the same links, through the store's getters and Discord's thumbnail helper. As on
 * PC, results and categories are shown as pictures (WebP), favorites keep their kind. A GIF you favorite is saved with
 * its own link, not the lowered one, and what you send is the GIF's page link as always.
 */

import { tx } from "@core/i18n";
import { after, before } from "@lib/api/patcher";

import { definePlugin, onSettingChange } from "../api";
import { getStore, moduleAt } from "../common";
import { atQuality, ChangedLinks, isVideoLink, Quality, qualityOf } from "./quality";

/** The fields of a GIF picker item that hold what is shown */
const SHOWN = ["src", "gifSrc"] as const;

export default definePlugin({
    id: "endcord.better-gif-load",
    name: "BetterGifLoad",
    description: tx("Change the quality of GIFs in the GIF picker. Improves performance and lowers internet usage."),
    icon: "GifIcon",
    tags: ["Media", "Utility"],
    settings: {
        gifQuality: {
            type: "select",
            label: tx("GIF quality"),
            default: "1",
            options: [
                { label: tx("High"), value: "1" },
                { label: tx("Reasonable"), value: "2" },
                { label: tx("Low"), value: "3" },
                { label: tx("Horrible"), value: "4" },
            ],
        },
    },
    start({ store, cleanup, logger }) {
        const picker = getStore("GIFPickerViewStore");
        if (typeof picker?.getResultItems !== "function") throw new Error("Discord's GIF picker wasn't found");
        // The picture kind items are switched to, where the items say their kind with Discord's numbers
        const pictureType = moduleAt("../discord_common/js/packages/protos/discord_protos/discord_users/v1/frecency_user_settings.tsx")?.GIFType?.IMAGE;

        // What a result was before, by the link it's shown with, for saving it as a favorite as it was
        const changed = new ChangedLinks<Record<string, unknown>>();
        // The same list from the store gives the same changed list, which its screens compare to know nothing changed
        let cache = new WeakMap<object, unknown[]>();
        const redraw = () => {
            cache = new WeakMap();
            picker.emitChange?.();
        };
        cleanup(() => {
            changed.clear();
            redraw();
        }, onSettingChange(store, redraw));

        const quality = (): Quality => qualityOf(store.gifQuality);

        function relink(item: any, asPicture: boolean) {
            if (!item || typeof item !== "object") return item;
            const size: [number, number] = [Number(item.width), Number(item.height)];
            let copy: any;
            for (const key of SHOWN) {
                const link = atQuality(item[key], quality(), size, asPicture);
                if (link === item[key]) continue;
                copy ??= { ...item };
                copy[key] = link;
            }
            if (!copy) return item;
            // Shown as a picture only when what's shown became one; a video left as it was stays a video
            if (asPicture && copy.src !== item.src && !isVideoLink(copy.src) && pictureType !== undefined && typeof item.format === typeof pictureType) copy.format = pictureType;
            const before = { src: item.src, gifSrc: item.gifSrc, format: item.format };
            changed.remember(copy.src, before);
            changed.remember(copy.gifSrc, before);
            return copy;
        }

        const relinkList = (list: unknown) => {
            if (!Array.isArray(list)) return list;
            let done = cache.get(list);
            if (!done) cache.set(list, done = list.map(item => relink(item, true)));
            return done;
        };

        cleanup(after("getResultItems", picker, (_args, items) => relinkList(items)));
        if (typeof picker.getTrendingCategories === "function") cleanup(after("getTrendingCategories", picker, (_args, categories) => relinkList(categories)));

        // Favorites keep their kind: a video stays a video, at the lower size
        const utils = moduleAt("utils/GIFPickerUtils.tsx");
        if (typeof utils?.getGIFThumbnailForFavorite === "function") {
            cleanup(after("getGIFThumbnailForFavorite", utils, ([favorite], thumbnail) => atQuality(thumbnail, quality(), [Number(favorite?.width), Number(favorite?.height)])));
        } else logger.warn("Discord's favorite GIF thumbnails weren't found; favorites load at Discord's quality");

        // Saved with the GIF's own links and kind, so lowering the quality never changes your favorites
        const actions = moduleAt("actions/GIFPickerActionCreators.tsx");
        if (typeof actions?.addFavoriteGIF === "function") {
            cleanup(before("addFavoriteGIF", actions, args => {
                const gif = args[0];
                const original = gif && typeof gif === "object" ? changed.original(gif.src) ?? changed.original(gif.gifSrc) : undefined;
                if (!original) return;
                const restored = { ...gif };
                for (const key of [...SHOWN, "format"]) if (key in restored) restored[key] = original[key];
                args[0] = restored;
            }));
        } else logger.warn("Discord's favorite GIF action wasn't found; a GIF favorited from the results is saved at the quality shown");

        redraw();
    },
});
