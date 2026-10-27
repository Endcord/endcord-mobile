/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { answer, enc, json, number, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.currency-converter",
    name: "CurrencyConverter",
    description: tx("Convert between currencies at today's rates with /currency"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShopIcon",
    tags: ["Utility"],
    start: only({
        name: "currency",
        description: tx("Convert money to another currency"),
        options: [
            { name: "amount", description: tx("How much"), type: "number", required: true },
            { name: "from", description: tx("Currency code, such as USD"), required: true },
            { name: "to", description: tx("Currency code, such as EUR"), required: true },
        ],
        run: async ({ amount, from, to }, ctx) => {
            const a = String(from).trim().toUpperCase(), b = String(to).trim().toUpperCase();
            const data = await json(`https://open.er-api.com/v6/latest/${enc(a)}`).catch(() => undefined);
            const rate = data?.rates?.[b];
            if (typeof rate !== "number") return answer(ctx, t("Couldn't convert {from} to {to}; check the currency codes.", { from: a, to: b }));
            const result = Number(amount) * rate;
            answer(ctx, `${number(Number(amount))} ${a} = **${result.toLocaleString(undefined, { maximumFractionDigits: result < 1 ? 6 : 2 })} ${b}**\n1 ${a} = ${rate} ${b}`);
        },
    }),
});
