/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.xkcd",
    name: "Xkcd",
    description: tx("Send an xkcd comic, the latest, a random one or a number, with /xkcd"),
    icon: "ImageIcon",
    tags: ["Fun"],
    start: only({
        name: "xkcd",
        description: tx("Send an xkcd comic"),
        options: [{ name: "number", description: tx("The comic's number; 0 for a random one"), type: "integer" }],
        run: async ({ number: n }) => {
            const latest = await json("https://xkcd.com/info.0.json");
            const wanted = n === 0 ? 1 + Math.floor(Math.random() * latest.num) : Number(n) || latest.num;
            const comic = wanted === latest.num ? latest : await json(`https://xkcd.com/${wanted}/info.0.json`);
            return `**xkcd #${comic.num}: ${comic.safe_title}**\n${comic.img}`;
        },
    }),
});
