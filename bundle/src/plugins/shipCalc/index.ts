/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { command, displayName, getUser } from "../hooks";
import { shipScore } from "../shared/text";

export default definePlugin({
    id: "endcord.ship-calc",
    name: "ShipCalc",
    description: tx("/ship rates the love between two people."),
    authors: [ENDCORD_AUTHOR],
    icon: "HeartIcon",
    tags: ["Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "ship",
            description: tx("Calculate a love percentage between two people"),
            options: [
                { name: "a", description: tx("First person"), required: true },
                { name: "b", description: tx("Second person"), required: true },
            ],
            run: ({ a, b }) => {
                const name = (value: string) => {
                    const id = value.match(/^<@!?(\d+)>$/)?.[1];
                    return id ? displayName(getUser(id)) : value;
                };
                const pct = shipScore(name(a), name(b));
                const heart = pct > 80 ? "💞" : pct > 50 ? "💖" : pct > 25 ? "💗" : "💔";
                return `${heart} **${name(a)}** + **${name(b)}** = **${pct}%**`;
            },
        }));
    },
});
