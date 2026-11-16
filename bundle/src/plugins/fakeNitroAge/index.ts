/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's FakeNitroAge: how long your profile says you've had Nitro, on this phone only. PC sets it from a button
 * beside your name; here it's the plugin's settings. Like PC, your user record says you subscribed that many months
 * ago; on a phone that alone shows nowhere unless you have Nitro, so your profile's Nitro badge is drawn for that many
 * months too, in the tier Discord gives it (the pictures are Discord's own, the ones CustomProfile uses). Unlike PC, the
 * app isn't also told you have Nitro when you don't: it would then offer uploads and emojis that Discord refuses.
 * Nothing is sent to Discord.
 */

import { t, tx } from "@core/i18n";
import { after } from "@lib/api/patcher";

import { definePlugin, onSettingChange } from "../api";
import { currentUserId, getStore, moduleAt } from "../common";
import { extendProfileBadges, isPluginBadge, linkedBadge } from "../profileBadges";
import { redrawProfiles } from "../shared/profiles";

/** PC's presets, in months */
const PRESETS: ReadonlyArray<{ label: string; value: string; }> = [
    { label: tx("1 month"), value: "1" },
    { label: tx("2 months"), value: "2" },
    { label: tx("3 months"), value: "3" },
    { label: tx("6 months"), value: "6" },
    { label: tx("1 year"), value: "12" },
    { label: tx("2 years"), value: "24" },
    { label: tx("3 years"), value: "36" },
    { label: tx("4 years"), value: "48" },
    { label: tx("5 years"), value: "60" },
    { label: tx("6 years"), value: "72" },
];
const MAX_MONTHS = 999;
const BADGE_ID = "endcord-fake-nitro-age";

/** Discord's Nitro badges by tier, from the months they take: the same pictures as CustomProfile's */
export const NITRO_TIERS: ReadonlyArray<{ months: number; icon: string; }> = [
    { months: 0, icon: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png" },
    { months: 1, icon: "https://cdn.discordapp.com/badge-icons/4f33c4a9c64ce221936bd256c356f91f.png" },
    { months: 3, icon: "https://cdn.discordapp.com/badge-icons/4514fab914bdbfb4ad2fa23df76121a6.png" },
    { months: 6, icon: "https://cdn.discordapp.com/badge-icons/2895086c18d5531d499862e41d1155a6.png" },
    { months: 12, icon: "https://cdn.discordapp.com/badge-icons/0334688279c8359120922938dcb1d6f8.png" },
    { months: 24, icon: "https://cdn.discordapp.com/badge-icons/0d61871f72bb9a33a7ae568c1fb4f20a.png" },
    { months: 36, icon: "https://cdn.discordapp.com/badge-icons/11e2d339068b55d3a506cff34d3780f3.png" },
    { months: 60, icon: "https://cdn.discordapp.com/badge-icons/cd5e2cfd9d7f27a8cdcd3e8a8d5dc9f4.png" },
    { months: 72, icon: "https://cdn.discordapp.com/badge-icons/5b154df19c53dce2af92c9b61e6be5e2.png" },
];

/** The picture of the tier Discord gives that many months of Nitro */
export function tierIcon(months: number): string {
    const earned = NITRO_TIERS.filter(tier => months >= tier.months);
    return (earned[earned.length - 1] ?? NITRO_TIERS[0]).icon;
}

/**
 * The day that many months before [now]. Clamped to the month's last day, so Mar 31 less a month is Feb 28 (or 29),
 * not the start of March as plain setMonth would make it
 */
export function monthsBefore(months: number, now = new Date()): Date {
    const date = new Date(now.getTime());
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() - months);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
    return date;
}

/** How many months the settings ask for: a preset, or the custom number held to PC's range */
export function chosenMonths(length: string, custom: number): number {
    const months = length === "custom" ? custom : Number(length);
    if (!Number.isFinite(months)) return 12;
    return Math.min(MAX_MONTHS, Math.max(1, Math.round(months)));
}

/** Discord's own Nitro badge, in any of its tiers: "premium", "premium_tenure_24_month_v2" */
export const isNitroBadge = (badge: any, defaultId?: string) =>
    typeof badge?.id === "string" && (badge.id === defaultId || /^premium(?:_tenure_\d+_months?(?:_v\d+)?)?$/i.test(badge.id));

export default definePlugin({
    id: "endcord.fake-nitro-age",
    name: "FakeNitroAge",
    description: tx("Set how many months or years of Nitro your profile shows. Only you see this."),
    icon: "NitroWheelIcon",
    tags: ["Customisation", "Fun"],
    settings: {
        length: {
            type: "select",
            label: tx("Nitro age"),
            description: tx("How long your profile says you've had Nitro. Only you see this."),
            default: "12",
            options: [...PRESETS, { label: tx("Custom"), value: "custom" }],
        },
        customMonths: {
            type: "number",
            label: tx("Custom months"),
            description: tx("Used when the Nitro age is Custom"),
            default: 12,
            min: 1,
            max: MAX_MONTHS,
        },
    },
    start({ store, cleanup }) {
        const users = getStore("UserStore");
        const profiles = getStore("UserProfileStore");
        if (typeof users?.getCurrentUser !== "function") throw new Error("Discord's user store wasn't found");

        const months = () => chosenMonths(store.length, store.customMonths);
        const defaultBadgeId: string | undefined = moduleAt("modules/premium/tiered_tenure_badging/Constants.tsx")?.DEFAULT_PREMIUM_BADGE_ID;

        // Discord compares what its stores return by reference: each stand-in is made once, until the record or the
        // months change, or it would draw again and again
        let since = monthsBefore(months());
        let userSource: any, userClone: any;
        const profileViews = new WeakMap<object, { since: Date; view: any; }>();
        const refresh = () => {
            since = monthsBefore(months());
            userSource = userClone = undefined;
            redrawProfiles();
        };

        cleanup(after("getCurrentUser", users, (_, user) => {
            try {
                if (!user || typeof user !== "object") return user;
                if (user === userSource && userClone) return userClone;
                // Every other property stays the record's own, getters included, on the record's own class
                const clone = Object.create(Object.getPrototypeOf(user));
                for (const key of Reflect.ownKeys(user)) {
                    const descriptor = Object.getOwnPropertyDescriptor(user, key);
                    if (descriptor) Object.defineProperty(clone, key, descriptor);
                }
                Object.defineProperty(clone, "premiumSince", { value: since, writable: true, configurable: true, enumerable: true });
                userSource = user;
                userClone = clone;
                return clone;
            } catch {
                return user;
            }
        }));

        if (typeof profiles?.getUserProfile === "function") {
            cleanup(after("getUserProfile", profiles, ([userId], profile) => {
                try {
                    if (!profile || typeof profile !== "object" || userId !== currentUserId()) return profile;
                    const kept = profileViews.get(profile);
                    if (kept?.since === since) return kept.view;
                    const fixed = since;
                    // A view of Discord's profile with another date; the profile itself, and its methods, stay as they are
                    const view = new Proxy(profile, {
                        get(target, key) {
                            if (key === "premiumSince") return fixed;
                            const value = Reflect.get(target, key, target);
                            return typeof value === "function" ? value.bind(target) : value;
                        },
                    });
                    profileViews.set(profile, { since: fixed, view });
                    return view;
                } catch {
                    return profile;
                }
            }));
        }

        // The Nitro badge itself, which Discord's profile draws from the badges its servers sent
        cleanup(extendProfileBadges("fake-nitro-age", (userId, badges) => {
            if (userId !== currentUserId()) return badges;
            const badge = linkedBadge(BADGE_ID, t("Subscriber since {date}", { date: since.toLocaleDateString() }), tierIcon(months()));
            const at = badges.findIndex(b => !isPluginBadge(b) && isNitroBadge(b, defaultBadgeId));
            const rest = badges.filter(b => isPluginBadge(b) || !isNitroBadge(b, defaultBadgeId));
            if (at !== -1) {
                // Where Discord's own was
                const before = badges.slice(0, at).filter(b => isPluginBadge(b) || !isNitroBadge(b, defaultBadgeId)).length;
                return [...rest.slice(0, before), badge, ...rest.slice(before)];
            }
            // Before the server boost badge, where Discord puts Nitro's
            const boost = rest.findIndex(b => typeof b?.id === "string" && b.id.startsWith("guild_booster"));
            return boost === -1 ? [...rest, badge] : [...rest.slice(0, boost), badge, ...rest.slice(boost)];
        }));

        cleanup(
            onSettingChange(store, key => {
                if (key === "length" || key === "customMonths") refresh();
            }),
            // Everything that showed the fake date draws again without it
            () => setTimeout(redrawProfiles, 0),
        );
        refresh();
    },
});
