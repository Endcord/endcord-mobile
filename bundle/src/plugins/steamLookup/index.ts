/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { answer, enc, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.steam-lookup",
    name: "SteamLookup",
    description: tx("Look up a game's price on Steam with /steam"),
    authors: [ENDCORD_AUTHOR],
    icon: "GameControllerIcon",
    tags: ["Utility", "Fun"],
    start: only({
        name: "steam",
        description: tx("A game on the Steam store"),
        options: [{ name: "game", description: tx("The game's name"), required: true }],
        run: async ({ game }, ctx) => {
            const items: any[] = (await json(`https://store.steampowered.com/api/storesearch/?term=${enc(String(game).trim())}&l=english&cc=us`))?.items ?? [];
            if (!items.length) return answer(ctx, t("No game called {game} was found on Steam.", { game }));
            answer(ctx, items.slice(0, 4).map(g => {
                const price = g.price ? `$${(g.price.final / 100).toFixed(2)}${g.price.initial > g.price.final ? ` (-${Math.round(100 - g.price.final / g.price.initial * 100)}%)` : ""}` : t("Free");
                return `**${g.name}** · ${price}${g.metascore ? ` · Metacritic ${g.metascore}` : ""}\nhttps://store.steampowered.com/app/${g.id}`;
            }).join("\n"));
        },
    }),
});
