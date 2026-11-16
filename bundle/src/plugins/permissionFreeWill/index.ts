/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's PermissionFreeWill, the part a phone has: Discord's onboarding checks, which stop you denying a channel
 * permission or deleting a channel when the server's onboarding would no longer have enough channels ("Making this
 * change will make your server incompatible [...]"), always pass, as PC makes them. Those checks are the same shared
 * functions on a phone. PC's other part, the permission lockout warning ("Pretty sure you don't want to do this"), is
 * inside the phone's permission screens, where nothing can reach it, so it stays.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { moduleAt } from "../common";

const CHECKS = "modules/guild_onboarding/DefaultChannelThresholdUtils.tsx";
const NAMES = ["checkChattableChannelThresholdMetAfterChannelPermissionDeny", "isDefaultChannelThresholdMetAfterDelete"];

export default definePlugin({
    id: "endcord.permission-free-will",
    name: "PermissionFreeWill",
    description: tx("Lets you deny channel permissions and delete channels without Discord's onboarding check (\"Making this change will make your server incompatible [...]\")."),
    icon: "ShieldIcon",
    tags: ["Servers"],
    start({ cleanup, logger }) {
        const checks = moduleAt(CHECKS);
        let patched = 0;
        for (const name of NAMES) {
            const original = checks?.[name];
            if (typeof original !== "function") {
                logger.warn(`Discord's ${name} wasn't found`);
                continue;
            }
            try {
                // As on Endcord PC: the check always says the server still meets onboarding's needs
                cleanup(instead(name, checks, () => Promise.resolve(true)));
                if (checks[name] !== original) patched++;
            } catch (e) {
                logger.warn(`Discord's ${name} couldn't be changed`, e);
            }
        }
        if (!patched) throw new Error("Discord's onboarding checks weren't found");
    },
});
