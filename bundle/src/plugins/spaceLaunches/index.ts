/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.space-launches",
    name: "SpaceLaunches",
    description: tx("See the next rocket launches with /launches"),
    icon: "FlashIcon",
    tags: ["Fun"],
    start: only({
        name: "launches",
        description: tx("The next rocket launches"),
        run: async (_, ctx) => {
            const launches: any[] = (await json("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&mode=list"))?.results ?? [];
            if (!launches.length) return answer(ctx, t("No launches came back; try again later."));
            answer(ctx, launches.map(l => `🚀 **${l.name}** · <t:${Math.floor(Date.parse(l.net) / 1000)}:R>\n   ${l.location ?? l.pad ?? ""} · ${l.status?.abbrev ?? ""}`).join("\n"));
        },
    }),
});
