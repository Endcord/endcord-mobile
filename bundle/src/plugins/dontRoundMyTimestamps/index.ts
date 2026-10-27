/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin } from "../api";

export default definePlugin({
    id: "endcord.dont-round-my-timestamps",
    name: "DontRoundMyTimestamps",
    description: tx("Always rounds relative timestamps down, so 7.6y becomes 7y instead of 8y"),
    icon: "ClockIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        const moment = findByProps("relativeTimeRounding", "utc") ?? findByProps("relativeTimeRounding");
        if (typeof moment?.relativeTimeRounding !== "function") throw new Error("Discord's time formatting wasn't found");
        const previous = moment.relativeTimeRounding();
        moment.relativeTimeRounding(Math.floor);
        cleanup(() => moment.relativeTimeRounding(previous ?? Math.round));
    },
});
