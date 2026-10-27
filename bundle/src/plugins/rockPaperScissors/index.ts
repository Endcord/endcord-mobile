/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { only, randomBytes } from "../shared/utility";

export default definePlugin({
    id: "endcord.rock-paper-scissors",
    name: "RockPaperScissors",
    description: tx("Play rock, paper, scissors with /rps and send the result"),
    authors: [ENDCORD_AUTHOR],
    icon: "GameControllerIcon",
    tags: ["Fun"],
    start: only({
        name: "rps",
        description: tx("Play rock, paper, scissors"),
        options: [{ name: "choice", description: tx("Your move"), required: true, choices: [{ name: "🪨 rock", value: "0" }, { name: "📄 paper", value: "1" }, { name: "✂️ scissors", value: "2" }] }],
        run: ({ choice }) => {
            const moves = ["🪨", "📄", "✂️"];
            const mine = Number(choice), theirs = randomBytes(1)[0] % 3;
            const result = mine === theirs ? t("It's a tie!") : (mine - theirs + 3) % 3 === 1 ? t("I win!") : t("I lose!");
            return `${moves[mine]} vs ${moves[theirs]} · ${result}`;
        },
    }),
});
