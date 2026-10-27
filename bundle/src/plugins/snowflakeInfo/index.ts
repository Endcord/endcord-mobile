/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { snowflakeTime } from "../hooks";
import { answer, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.snowflake-info",
    name: "SnowflakeInfo",
    description: tx("See when any Discord ID (a user, message, server...) was made with /snowflake"),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Utility"],
    start: only({
        name: "snowflake",
        description: tx("When a Discord ID was made"),
        options: [{ name: "id", description: tx("The ID"), required: true }],
        run: ({ id }, ctx) => {
            const value = String(id).trim().match(/\d{15,21}/)?.[0];
            if (!value) return answer(ctx, t("That isn't a Discord ID."));
            const time = Math.floor(snowflakeTime(value) / 1000);
            // The low 22 bits, from the decimal digits, since the ID is too big for a number
            let low = 0;
            for (const digit of value) low = (low * 10 + Number(digit)) % 4194304;
            answer(ctx, [
                `**${value}**`,
                `${t("Made")}: <t:${time}:F> (<t:${time}:R>)`,
                `Worker ${low >> 17 & 31} · Process ${low >> 12 & 31} · Increment ${low & 4095}`,
            ].join("\n"));
        },
    }),
});
