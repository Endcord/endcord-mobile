/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { answer, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.earthquakes",
    name: "Earthquakes",
    description: tx("See the latest strong earthquakes around the world, or near a place, with /earthquakes"),
    authors: [ENDCORD_AUTHOR],
    icon: "GlobeEarthIcon",
    tags: ["Utility"],
    start: only({
        name: "earthquakes",
        description: tx("The latest earthquakes"),
        options: [{ name: "place", description: tx("Only ones whose location mentions this, such as Turkey") }],
        run: async ({ place }, ctx) => {
            const data = await json("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson");
            const filter = String(place ?? "").trim().toLowerCase();
            const quakes = (data?.features ?? [])
                .filter((f: any) => !filter || String(f.properties?.place ?? "").toLowerCase().includes(filter))
                .slice(0, 10);
            if (!quakes.length) return answer(ctx, t("No earthquakes of magnitude 2.5 or more in the last day."));
            answer(ctx, quakes.map((f: any) => `**M${Number(f.properties.mag).toFixed(1)}** · ${f.properties.place} · <t:${Math.floor(f.properties.time / 1000)}:R>`).join("\n"));
        },
    }),
});
