/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's BannersEverywhere: people's banners in member lists. As on PC, a banner is known once the person's
 * profile has loaded (you opened it, here or before: they're remembered), or from USRBG and CustomProfile when those
 * run, so nothing extra is downloaded to find them. React Native has no CSS mask to fade a banner in behind the name,
 * so it's drawn faintly over the right side of the row, where it doesn't hide the name or the avatar, and taps go
 * through it. Someone with a nameplate keeps the nameplate (Discord draws it from the user, which this leaves alone).
 */

import { tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { after } from "@lib/api/patcher";
import { findByProps, findByTypeNameAll } from "@metro";
import { FluxUtils } from "@metro/common";
import { cloneElement, isValidElement, type ReactElement } from "react";
import { Image, View } from "react-native";

import { definePlugin } from "../api";
import { getStore } from "../common";

/** Banners remembered between starts, by user */
const MAX_REMEMBERED = 2000;
/** Wide enough for the part of a row it covers, and a small download */
const BANNER_SIZE = 320;

const kept = wrapSync(createStorage<{ users?: Record<string, string>; }>(createMMKVBackend("ENDCORD_BANNERS_EVERYWHERE", { users: {} })));

const HASH = /^(a_)?[0-9a-f]{32}$/;
const USER_ID = /^\d{17,20}$/;

/** A banner hash from a profile, when it is one */
export const bannerHash = (value: unknown): string | undefined => typeof value === "string" && HASH.test(value) ? value : undefined;

/** Discord's CDN link of a banner: still unless animating is on */
export function cdnBanner(userId: string, hash: string, animate: boolean): string {
    const animated = animate && hash.startsWith("a_");
    return `https://cdn.discordapp.com/banners/${userId}/${hash}.${animated ? "gif" : "webp"}?size=${BANNER_SIZE}`;
}

/** What's kept of the remembered banners: valid ones, the most recently seen last, at most `max` */
export function remember(users: Record<string, string>, userId: string, hash: string, max = MAX_REMEMBERED): Record<string, string> {
    const kept: Record<string, string> = {};
    for (const [id, h] of Object.entries(users)) if (id !== userId && USER_ID.test(id) && HASH.test(h)) kept[id] = h;
    kept[userId] = hash;
    const ids = Object.keys(kept);
    for (const id of ids.slice(0, Math.max(0, ids.length - max))) delete kept[id];
    return kept;
}

const plugin = definePlugin({
    id: "endcord.banners-everywhere",
    name: "BannersEverywhere",
    description: tx("Displays banners in the member list"),
    icon: "ImageIcon",
    tags: ["Appearance", "Customisation"],
    settings: {
        animate: { type: "boolean", label: tx("Animate banners"), default: false },
    },
    async start({ cleanup, logger }) {
        const rows = findByTypeNameAll("UserRow").filter(row => typeof row?.type === "function");
        if (!rows.length) throw new Error("Discord's member list rows weren't found");
        await awaitStorage(kept);

        for (const row of rows) {
            cleanup(after("type", row, ([props], element) => {
                try {
                    const user = props?.user;
                    if (!user?.id || user.bot || !isValidElement(element) || element.type === BannerRow) return;
                    // Discord's nameplate stays
                    if (user.collectibles?.nameplate) return;
                    // The row's props stay on the outside, so other plugins that change them (PlatformIndicators adds
                    // to the label) still find them, whichever patch runs first
                    return <BannerRow key={element.key} {...(element.props as object)} endcordRow={element} endcordUser={user} />;
                } catch (e) {
                    logger.error("Couldn't add a banner to a member", e);
                }
            }));
        }
        cleanup(() => {
            clearTimeout(saveTimer);
            saveTimer = undefined;
            pending = {};
        });
    },
});

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending: Record<string, string> = {};

/** Remembers a banner seen, in one write for those seen together */
function rememberLater(userId: string, hash: string) {
    if (kept.users?.[userId] === hash) return;
    pending[userId] = hash;
    saveTimer ??= setTimeout(() => {
        saveTimer = undefined;
        let users = { ...kept.users ?? {} };
        for (const [id, h] of Object.entries(pending)) users = remember(users, id, h);
        pending = {};
        kept.users = users;
    }, 2000);
}

/** The banner's link: USRBG's or CustomProfile's when they have one, else Discord's from the profile or memory */
function bannerUrl(user: any, hash: string | undefined): string | undefined {
    const animate = !!plugin.store.animate;
    try {
        const url = findByProps("getUserBannerURL")?.getUserBannerURL?.({ id: user.id, banner: hash ?? null, canAnimate: animate, size: BANNER_SIZE });
        if (typeof url === "string" && url.startsWith("https://") && !url.includes("undefined")) return url;
    } catch { }
    return hash ? cdnBanner(user.id, hash, animate) : undefined;
}

/** The row as Discord draws it, with what other plugins changed in its props, and the banner over its right side */
function BannerRow({ endcordRow, endcordUser, ...props }: { endcordRow: ReactElement; endcordUser: any; [key: string]: any; }) {
    return <View>
        {cloneElement(endcordRow, props)}
        <RowBanner user={endcordUser} />
    </View>;
}

function RowBanner({ user }: { user: any; }) {
    const profiles = getStore("UserProfileStore");
    const fromProfile: string | undefined = FluxUtils.useStateFromStores(profiles ? [profiles] : [], () => bannerHash(profiles?.getUserProfile?.(user.id)?.banner), [user.id]);
    if (fromProfile) rememberLater(user.id, fromProfile);
    const hash = fromProfile ?? bannerHash(kept.users?.[user.id]);
    const uri = bannerUrl(user, hash);
    if (!uri) return null;
    // Taps go through to the row
    return <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "45%", opacity: 0.35, borderRadius: 4, overflow: "hidden" }}>
        <Image source={{ uri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
    </View>;
}

export default plugin;
