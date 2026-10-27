/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.discord-status",
    name: "DiscordStatus",
    description: tx("Check whether Discord itself is having problems with /discordstatus"),
    icon: "ServerIcon",
    tags: ["Utility"],
    start: only({
        name: "discordstatus",
        description: tx("Whether Discord is having problems"),
        run: async (_, ctx) => {
            const data = await json("https://discordstatus.com/api/v2/summary.json");
            const broken = (data?.components ?? []).filter((c: any) => c.status && c.status !== "operational" && !c.group);
            const incidents = (data?.incidents ?? []).slice(0, 3);
            answer(ctx, [
                `**${data?.status?.description ?? "?"}**`,
                ...broken.map((c: any) => `⚠️ ${c.name}: ${c.status.replace(/_/g, " ")}`),
                ...incidents.map((i: any) => `🔧 ${i.name} (${i.status})`),
                "https://discordstatus.com",
            ].join("\n"));
        },
    }),
});
