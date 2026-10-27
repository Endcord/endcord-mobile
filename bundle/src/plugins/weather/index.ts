/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { command } from "../hooks";
import { answer, enc, json } from "../shared/utility";

export default definePlugin({
    id: "endcord.weather",
    name: "Weather",
    description: tx("See the weather anywhere with /weather"),
    authors: [ENDCORD_AUTHOR],
    icon: "CloudIcon",
    tags: ["Utility"],
    settings: {
        units: { type: "select", label: tx("Units"), default: "metric", options: [{ label: tx("Metric (°C, km/h)"), value: "metric" }, { label: tx("Imperial (°F, mph)"), value: "imperial" }] },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "weather",
            description: tx("The weather in a place"),
            options: [{ name: "place", description: tx("A city or place"), required: true }],
            run: async ({ place }, ctx) => {
                const data = await json(`https://wttr.in/${enc(String(place).trim())}?format=j1`);
                const now = data?.current_condition?.[0];
                if (!now) return answer(ctx, t("No weather found for {place}.", { place }));
                const area = data.nearest_area?.[0];
                const where = [area?.areaName?.[0]?.value, area?.country?.[0]?.value].filter(Boolean).join(", ") || place;
                const metric = store.units === "metric";
                const today = data.weather?.[0];
                answer(ctx, [
                    `**${where}** · ${now.weatherDesc?.[0]?.value ?? ""}`,
                    `🌡 ${metric ? `${now.temp_C}°C` : `${now.temp_F}°F`} (${t("feels like {temp}", { temp: metric ? `${now.FeelsLikeC}°C` : `${now.FeelsLikeF}°F` })})`,
                    today ? `↕ ${metric ? `${today.mintempC}–${today.maxtempC}°C` : `${today.mintempF}–${today.maxtempF}°F`}` : "",
                    `💧 ${now.humidity}% · 💨 ${metric ? `${now.windspeedKmph} km/h` : `${now.windspeedMiles} mph`}`,
                ].filter(Boolean).join("\n"));
            },
        }));
    },
});
