/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { getStore } from "../common";

export default definePlugin({
    id: "endcord.always-trust",
    name: "AlwaysTrust",
    description: tx("Removes the annoying popup about leaving Discord for another website"),
    icon: "LinkIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const links = getStore("MaskedLinkStore");
        if (typeof links?.isTrustedDomain !== "function") throw new Error("Discord's link checks weren't found");
        // Only the question about the website a link goes to, as on Endcord PC. Links that open another app (market:,
        // upi:, intent: and the like) still ask first: one tap on such a link in someone's message could otherwise
        // start a payment or an install screen
        cleanup(instead("isTrustedDomain", links, () => true));
    },
});
