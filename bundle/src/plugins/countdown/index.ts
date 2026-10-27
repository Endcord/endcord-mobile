/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.countdown",
    name: "Countdown",
    description: tx("See how long is left until a date with /countdown"),
    icon: "ClockIcon",
    tags: ["Utility"],
    start: only({
        name: "countdown",
        description: tx("How long until a date"),
        options: [{ name: "date", description: tx("Such as 2027-01-01 or 2027-01-01 18:30"), required: true }],
        run: ({ date }, ctx) => {
            const when = Date.parse(String(date).trim().replace(" ", "T"));
            if (Number.isNaN(when)) return answer(ctx, t("Write the date like 2027-01-01 or 2027-01-01 18:30."));
            let left = Math.abs(when - Date.now()) / 1000;
            const days = Math.floor(left / 86400); left %= 86400;
            const hours = Math.floor(left / 3600); left %= 3600;
            const minutes = Math.floor(left / 60);
            const span = t("{days} days, {hours} hours, {minutes} minutes", { days, hours, minutes });
            answer(ctx, `<t:${Math.floor(when / 1000)}:F>\n${when >= Date.now() ? t("{span} left", { span }) : t("{span} ago", { span })}`);
        },
    }),
});
