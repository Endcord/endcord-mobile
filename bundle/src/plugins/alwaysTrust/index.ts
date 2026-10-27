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
    description: tx("Removes the annoying untrusted domain and suspicious file popup"),
    icon: "LinkIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const links = getStore("MaskedLinkStore");
        if (typeof links?.isTrustedDomain !== "function") throw new Error("Discord's link checks weren't found");
        cleanup(instead("isTrustedDomain", links, () => true));
        if (typeof links.isTrustedProtocol === "function") cleanup(instead("isTrustedProtocol", links, () => true));
    },
});
