/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Badges that plugins add to profiles. Discord's profile asks useBadges for a user's badges and draws each one from
 * its CDN by icon hash; these are drawn from their own image links instead. One set of patches serves every plugin.
 */

import { before, instead } from "@lib/api/patcher";
import { findByName, findByProps } from "@metro";

/** Changes the list of badges a profile shows */
export type BadgeExtender = (userId: string, badges: any[]) => any[];

const extenders = new Map<string, BadgeExtender>();
/** Badge id → the image it's drawn from */
const sources = new Map<string, string>();
let unpatch: (() => void) | undefined;

/** A badge for useBadges' list, drawn from `uri` */
export function linkedBadge(id: string, description: string, uri: string) {
    sources.set(id, uri);
    return { id, description, icon: "dummy", iconSrc: uri };
}

/** Whether a badge in the list comes from a plugin rather than from Discord */
export const isPluginBadge = (badge: any) => typeof badge?.id === "string" && sources.has(badge.id);

/** Runs `extend` on every profile's badges until the returned function is called */
export function extendProfileBadges(key: string, extend: BadgeExtender): () => void {
    unpatch ??= patch();
    extenders.set(key, extend);
    return () => {
        extenders.delete(key);
        if (extenders.size) return;
        unpatch?.();
        unpatch = undefined;
    };
}

function patch() {
    const useBadges = findByName("useBadges", false);
    if (typeof useBadges?.default !== "function") throw new Error("Discord's profile badges weren't found");
    const unpatches: Array<() => unknown> = [];

    unpatches.push(instead("default", useBadges, function (this: any, args, original) {
        let result = original.apply(this, args);
        const userId = args[0]?.userId;
        if (!userId || !Array.isArray(result)) return result;
        for (const [key, extend] of extenders) {
            try {
                result = extend(userId, result);
            } catch (e) {
                console.error(`[Endcord] ${key} couldn't change the badges`, e);
            }
        }
        return result;
    }));

    const withSource = (props: any) => {
        const uri = props?.id && sources.get(props.id);
        return uri ? { ...props, source: { uri } } : props;
    };
    const badge = findByName("ProfileBadge", false);
    if (typeof badge?.default === "function") {
        // Only badges go through this
        unpatches.push(before("default", badge, (args: any[]) => void (args[0] = withSource(args[0]))));
    } else {
        // Without the component itself, every element the app creates is checked for it, which costs more
        const runtime = findByProps("jsx", "jsxs");
        const check = (args: any[]) => {
            const type = args[0];
            const name = typeof type === "function" ? type.name : type?.type?.name;
            if (name === "ProfileBadge") args[1] = withSource(args[1]);
        };
        if (runtime) unpatches.push(before("jsx", runtime, check), before("jsxs", runtime, check));
    }

    // Discord maps badge ids to its own; plugin badges keep theirs. toProfileBadgeLegacyId isn't in every Discord
    // (iOS 344 doesn't have it)
    const ids = findByProps("resolveProfileBadgeId");
    for (const key of ["resolveProfileBadgeId", "toProfileBadgeLegacyId"]) {
        if (typeof ids?.[key] === "function") {
            unpatches.push(instead(key, ids, function (this: any, args, original) {
                return typeof args[0] === "string" && sources.has(args[0]) ? args[0] : original.apply(this, args);
            }));
        }
    }

    return () => unpatches.forEach(u => u());
}
