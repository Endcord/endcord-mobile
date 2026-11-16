/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's FavoriteEmojiFirst: the emoji suggestions shown as you type :name put your favorite emojis first. PC
 * reorders them where the desktop autocomplete draws its results; on the phone the same happens to what Discord's
 * emoji query for the autocomplete (AutocompleteUtils.queryEmojiResults) returns. As on PC, Discord is asked for more
 * matches than it shows, so a favorite that would have been cut off still comes first, and the list is cut back after.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { getStore, moduleAt } from "../common";
import { LOOK_THROUGH, reorderResult } from "./order";

export default definePlugin({
    id: "endcord.favorite-emoji-first",
    name: "FavoriteEmojiFirst",
    description: tx("Puts your favorite emoji first in the emoji autocomplete."),
    icon: "StarIcon",
    tags: ["Emotes", "Customisation"],
    start({ cleanup, logger }) {
        const utils = moduleAt("utils/AutocompleteUtils.tsx")?.default;
        if (typeof utils?.queryEmojiResults !== "function") throw new Error("Discord's emoji suggestions weren't found");
        const emojis = getStore("EmojiStore");
        if (typeof emojis?.getDisambiguatedEmojiContext?.()?.isFavoriteEmojiWithoutFetchingLatest !== "function") throw new Error("Discord's favorite emojis weren't found");

        let unknownShape = false;

        cleanup(instead("queryEmojiResults", utils, function (this: any, args, original) {
            const [options] = args;
            const count = typeof options?.maxCount === "number" && options.maxCount > 0 ? options.maxCount : undefined;
            if (unknownShape) return original.apply(this, args);
            const asked = count !== undefined ? [{ ...options, maxCount: Math.max(count, LOOK_THROUGH) }, ...args.slice(1)] : args;
            const reorder = (result: unknown) => {
                try {
                    const context = emojis.getDisambiguatedEmojiContext();
                    const reordered = reorderResult(result, count ?? Infinity, (emoji: any) => !!emoji && context.isFavoriteEmojiWithoutFetchingLatest(emoji));
                    if (reordered !== undefined) return reordered;
                    unknownShape = true;
                    logger.warn("Discord's emoji suggestions changed shape; they're left in Discord's order");
                } catch (e) {
                    logger.error("Couldn't put favorite emojis first", e);
                }
                // Asked again as Discord asked, so it never shows more than it meant to
                return count !== undefined ? original.apply(this, args) : result;
            };
            const result = original.apply(this, asked);
            return typeof result?.then === "function" ? result.then(reorder) : reorder(result);
        }));
    },
});
