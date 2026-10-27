/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, enc, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.holidays",
    name: "Holidays",
    description: tx("See a country's next public holidays with /holidays"),
    icon: "CalendarIcon",
    tags: ["Utility"],
    start: only({
        name: "holidays",
        description: tx("The next public holidays in a country"),
        options: [{ name: "country", description: tx("Two-letter country code, such as TR or US"), required: true }],
        run: async ({ country }, ctx) => {
            const code = String(country).trim().toUpperCase();
            const days: any[] = await json(`https://date.nager.at/api/v3/NextPublicHolidays/${enc(code)}`).catch(() => []);
            if (!days.length) return answer(ctx, t("No holidays were found for {country}.", { country: code }));
            answer(ctx, days.slice(0, 8).map(d => `📅 <t:${Math.floor(Date.parse(`${d.date}T12:00:00Z`) / 1000)}:D> · **${d.localName}**${d.localName !== d.name ? ` (${d.name})` : ""}`).join("\n"));
        },
    }),
});
