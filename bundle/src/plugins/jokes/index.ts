/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.jokes",
    name: "Jokes",
    description: tx("Send a random joke with /joke"),
    icon: "ReactionIcon",
    tags: ["Fun"],
    start: only({
        name: "joke",
        description: tx("Send a random joke"),
        options: [{ name: "kind", description: tx("What kind"), choices: [{ name: "programming", value: "Programming" }, { name: "pun", value: "Pun" }, { name: "misc", value: "Misc" }, { name: "spooky", value: "Spooky" }] }],
        run: async ({ kind }) => {
            const j = await json(`https://v2.jokeapi.dev/joke/${kind ?? "Programming,Misc,Pun,Spooky"}?safe-mode`);
            return j.type === "twopart" ? `${j.setup}\n||${j.delivery}||` : j.joke;
        },
    }),
});
