/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, enc, json, number, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.crypto-prices",
    name: "CryptoPrices",
    description: tx("See a cryptocurrency's price and its change today with /crypto"),
    icon: "ShopIcon",
    tags: ["Utility"],
    start: only({
        name: "crypto",
        description: tx("A cryptocurrency's price"),
        options: [{ name: "coin", description: tx("Its name, such as bitcoin"), required: true }],
        run: async ({ coin }, ctx) => {
            const id = String(coin).trim().toLowerCase().replace(/\s+/g, "-");
            const data = await json(`https://api.coingecko.com/api/v3/simple/price?ids=${enc(id)}&vs_currencies=usd,eur&include_24hr_change=true`);
            const price = data?.[id];
            if (!price) return answer(ctx, t("No coin called {coin} was found.", { coin }));
            const change = price.usd_24h_change;
            answer(ctx, `**${id}** · $${number(price.usd)} · €${number(price.eur)}${typeof change === "number" ? ` · ${change >= 0 ? "📈 +" : "📉 "}${change.toFixed(2)}%` : ""}`);
        },
    }),
});
