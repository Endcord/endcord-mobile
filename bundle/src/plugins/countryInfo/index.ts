/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { safeFetch } from "@lib/utils";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { answer, Country, enc, findCountry, json, number, only } from "../shared/utility";

let countries: Promise<Country[]> | undefined;

/** Every country, from a free API that needs no key; fetched once, and again after a failure */
function countryList(): Promise<Country[]> {
    countries ??= safeFetch("https://countries.trevorblades.com/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ countries { code name native capital emoji currency languages { name } continent { name } } }" }),
    }).then(r => r.json()).then(data => {
        const list = data?.data?.countries;
        if (!Array.isArray(list)) throw new Error("No countries came back");
        return list;
    });
    return countries.catch(e => {
        countries = undefined;
        throw e;
    });
}

export default definePlugin({
    id: "endcord.country-info",
    name: "CountryInfo",
    description: tx("Look up a country's capital, population, languages and currency with /country"),
    authors: [ENDCORD_AUTHOR],
    icon: "GlobeEarthIcon",
    tags: ["Utility"],
    start: only({
        name: "country",
        description: tx("Facts about a country"),
        options: [{ name: "name", description: tx("The country, or its two-letter code"), required: true }],
        run: async ({ name }, ctx) => {
            const c = findCountry(await countryList(), String(name));
            if (!c) return answer(ctx, t("No country called {name} was found.", { name }));
            // The World Bank's latest count; countries it doesn't track show without one
            const population = await json(`https://api.worldbank.org/v2/country/${enc(c.code)}/indicator/SP.POP.TOTL?format=json&mrnev=1`)
                .then(data => data?.[1]?.[0]).catch(() => undefined);
            answer(ctx, [
                `${c.emoji ?? ""} **${c.name}**${c.native && c.native !== c.name ? ` (${c.native})` : ""}`,
                `${t("Capital")}: ${c.capital || "—"}`,
                `${t("Population")}: ${typeof population?.value === "number" ? `${number(population.value)} (${population.date})` : "—"}`,
                `${t("Region")}: ${c.continent?.name || "—"}`,
                `${t("Languages")}: ${(c.languages ?? []).map(l => l.name).join(", ") || "—"}`,
                `${t("Currency")}: ${c.currency?.split(",").join(", ") || "—"}`,
            ].join("\n"));
        },
    }),
});
