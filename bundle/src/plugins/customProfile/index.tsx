/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's CustomProfile: your username, display name, avatar, banner, bio, pronouns, profile colors, Nitro,
 * badges, avatar decoration, profile effect, account creation date, email and phone, as only you see them. Profiles
 * are kept per account and can be saved as presets.
 */

import { t, tx } from "@core/i18n";
import { after, instead } from "@lib/api/patcher";
import { findByProps } from "@metro";
import { NavigationNative } from "@metro/common";
import { Button } from "@metro/common/components";

import { definePlugin } from "../api";
import { addChatButton, addToolboxAction, getChatInputActionButton, getStore, moduleAt, subscribe } from "../common";
import { generatedIcon, onMessageRow, redrawChannel, RowOrder, toastError } from "../hooks";
import { extendProfileBadges, isPluginBadge, linkedBadge } from "../profileBadges";
import { openPage } from "../ui/pages";
import { applyLayout, PROFILE_ID_PREFIX, profileBadgeId, setBadgeLayout, setManagedBadges, startBadgeManagement } from "./badges";
import {
    AVATAR_DECORATIONS, BOOST_MONTHS, buildBadges, type CustomProfileData, getDecorationUrl, hasCustomBadgesConfigured,
    NITRO_LEVEL_MONTHS, wantsNitroLook
} from "./data";
import { dataVersion, getProfileDataFor, layoutOf, loadSaved, myId, saveAccount, saved, saveLayout, setChangeHandler, syncFromStorage } from "./store";

const BUTTON_OPTIONS = [
    { label: tx("Hidden"), value: "none" },
    { label: tx("Left of the message box"), value: "left" },
    { label: tx("Right of the message box"), value: "right" },
];

const OUR_DECORATIONS = new Set(AVATAR_DECORATIONS.map(d => d.id));
const DATE_SUFFIX = "T12:00:00Z";

// The editor is loaded when it first opens, not with the plugin at startup
const EditorPage = ({ close }: { close: () => void; }) => {
    const CustomProfileEditor = require("./Editor").default as typeof import("./Editor").default;
    return <CustomProfileEditor onClose={close} />;
};

/** Opens the editor: from the plugin's settings, as the next page there; from the chat or EndcordToolbox, as a window */
const openEditor = (navigation?: any) => openPage(t("Custom Profile"), EditorPage, navigation);

function OpenButton() {
    const navigation = NavigationNative.useNavigation();
    return <Button text={t("Open Custom Profile")} variant="primary" onPress={() => openEditor(navigation)} />;
}

// A record like Discord's own, with some fields replaced. The same source and data give back the same object, so
// screens that compare what the store returns don't redraw for nothing.
const mergeCache = new WeakMap<object, { key: string; out: any; }>();
function mergeRecord(source: any, merged: Record<string, unknown>, key: string) {
    const hit = mergeCache.get(source);
    if (hit?.key === key) return hit.out;
    const out = Object.create(Object.getPrototypeOf(source));
    for (const k of Reflect.ownKeys(source)) {
        const desc = Object.getOwnPropertyDescriptor(source, k);
        if (desc) Object.defineProperty(out, k, { ...desc, configurable: true });
    }
    for (const [k, v] of Object.entries(merged)) Object.defineProperty(out, k, { value: v, writable: true, configurable: true, enumerable: true });
    mergeCache.set(source, { key, out });
    return out;
}

function monthsAgo(months: number) {
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    return date;
}

// Fake user records ---------------------------------------------------------------------------------------------------

const fakeCache = new Map<string, { v: number; src: any; fake: any; }>();
const building = new WeakSet<object>();

/** Keeps the real record when the clone would lose Discord's staff check */
function userIfStaffWorks(fake: any, raw: any) {
    try {
        if (!fake || fake === raw) return fake || raw;
        if (typeof raw?.isStaff === "function" && typeof fake.isStaff !== "function") return raw;
        return fake;
    } catch {
        return raw;
    }
}

function fakeUser(user: any, forceMe?: boolean) {
    if (!user || user.__cp_isClone || building.has(user)) return user;
    const pd = getProfileDataFor(user.id);
    if (!pd) return user;
    const cached = fakeCache.get(user.id);
    if (cached && cached.v === dataVersion() && cached.src === user) return cached.fake;

    building.add(user);
    try {
        const isMe = forceMe ?? user.id === myId();
        const real = user.__cp_origUser || user;
        const realUsername = real.username;
        const realGlobalName = real.globalName;

        const clone = Object.create(Object.getPrototypeOf(real));
        const setProp = (k: string, v: unknown, enumerable = true) => Object.defineProperty(clone, k, { value: v, writable: true, configurable: true, enumerable });
        for (const key of Reflect.ownKeys(real)) {
            if (key === "username" || key === "globalName" || key === "displayName" || key === "discriminator" || key === "__cp_isClone" || key === "__cp_origUser") continue;
            const desc = Object.getOwnPropertyDescriptor(real, key);
            if (!desc) continue;
            if ("value" in desc) Object.defineProperty(clone, key, { value: desc.value, writable: true, configurable: true, enumerable: !!desc.enumerable });
            else Object.defineProperty(clone, key, { get: desc.get, set: desc.set ?? (() => { }), configurable: true, enumerable: !!desc.enumerable });
        }
        setProp("__cp_isClone", true, false);
        setProp("__cp_origUser", real, false);

        const fakeUsername = pd.username || realUsername;
        const fakeGlobal = isMe && pd.globalName ? pd.globalName : realGlobalName;
        const fakeDisplay = isMe && pd.globalName ? pd.globalName : realGlobalName || realUsername;
        setProp("username", fakeUsername);
        setProp("globalName", fakeGlobal);
        setProp("displayName", fakeDisplay);
        setProp("discriminator", "0");
        if (pd.email && isMe) setProp("email", pd.email);
        if (pd.phone && isMe) setProp("phone", pd.phone);
        setProp("getTag", () => fakeUsername, false);
        setProp("getGlobalName", () => fakeGlobal, false);
        setProp("hasUniqueUsername", () => true, false);
        setProp("isPomelo", () => true, false);
        setProp("hasHadPomelo", () => true, false);
        setProp("toString", () => fakeDisplay, false);
        if (pd.createdAt) setProp("createdAt", new Date(pd.createdAt + DATE_SUFFIX));
        if (pd.decorationAsset) {
            // Discord reads both names, depending on the screen
            const decoration = { asset: pd.decorationAsset, skuId: pd.decorationAsset };
            setProp("avatarDecoration", decoration);
            setProp("avatarDecorationData", decoration);
        }
        const flags = pd.badgeFlags != null && pd.badgeFlags > 0 ? pd.badgeFlags : undefined;
        setProp("publicFlags", flags ?? real.publicFlags);
        setProp("flags", flags ?? real.flags);
        if (wantsNitroLook(pd)) {
            setProp("premiumSince", monthsAgo(NITRO_LEVEL_MONTHS[pd.nitroLevel ?? 0] ?? 0));
            const boost = pd.boostMonths ?? -1;
            setProp("premiumGuildSince", boost >= 0 ? monthsAgo(BOOST_MONTHS[boost] ?? 1) : null);
        } else if (pd.nitro === false) {
            setProp("premiumType", 0);
            setProp("premiumSince", null);
            setProp("premiumGuildSince", null);
        }

        if (fakeCache.size > 250) fakeCache.clear();
        fakeCache.set(user.id, { v: dataVersion(), src: user, fake: clone });
        return clone;
    } catch {
        return user;
    } finally {
        building.delete(user);
    }
}

/** The name shown for a user with a custom profile, from their real record */
function shownName(user: any, pd: CustomProfileData, isMe: boolean): string | undefined {
    if (isMe && pd.globalName) return pd.globalName;
    if (pd.username && !user?.globalName) return pd.username;
    return undefined;
}

// Profiles ------------------------------------------------------------------------------------------------------------

/** Marks a profile as having a banner; the banner's link comes from getUserBannerURL */
const BANNER_MARKER = "endcord_custom_banner";

function hookProfile(profile: any, userId: string) {
    if (!profile || !userId) return profile;
    const pd = getProfileDataFor(userId);
    if (!pd) return profile;
    try {
        const merged: Record<string, unknown> = {};
        if (pd.bio) merged.bio = pd.bio;
        if (pd.pronouns) merged.pronouns = pd.pronouns;
        if (pd.accentColor != null) merged.accentColor = pd.accentColor;
        if (pd.banner) {
            merged.banner = BANNER_MARKER;
            merged.premiumType = 2;
        }
        if (pd.decorationAsset) {
            const decoration = { asset: pd.decorationAsset, skuId: pd.decorationAsset };
            merged.avatarDecoration = decoration;
            merged.avatarDecorationData = decoration;
        }
        if (pd.profileEffectId) {
            merged.profileEffectId = pd.profileEffectId;
            merged.profileEffect = { expireAt: null, skuId: pd.profileEffectId };
            merged.premiumType ??= 2;
        }

        if (wantsNitroLook(pd)) {
            merged.premiumType = 2;
            if (pd.accentColor != null) merged.themeColors = [pd.accentColor, pd.accentColor2 ?? pd.accentColor];
            merged.premiumSince = monthsAgo(NITRO_LEVEL_MONTHS[pd.nitroLevel ?? 0] ?? 0);
            const boost = pd.boostMonths ?? -1;
            merged.premiumGuildSince = boost >= 0 ? monthsAgo(BOOST_MONTHS[boost] ?? 1) : null;
        } else if (pd.nitro === false) {
            merged.premiumType = profile.premiumType ?? 0;
            merged.premiumSince = profile.premiumSince ?? null;
            merged.premiumGuildSince = profile.premiumGuildSince ?? null;
        }

        // Custom badges replace the account's own
        if (hasCustomBadgesConfigured(pd)) {
            merged.badges = [];
            if (pd.badgeFlags != null && pd.badgeFlags > 0) merged.publicFlags = pd.badgeFlags;
        }
        return mergeRecord(profile, merged, `${userId}:${dataVersion()}`);
    } catch {
        return profile;
    }
}

// The plugin ----------------------------------------------------------------------------------------------------------

const plugin = definePlugin({
    id: "endcord.custom-profile",
    name: "CustomProfile",
    description: tx("Visually customize your Discord profile (username, PFP, banner, badges, bio...) — persistent, only visible to you."),
    popular: 1,
    icon: "UserCircleIcon",
    tags: ["Appearance", "Customisation"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "right", options: BUTTON_OPTIONS },
    },
    SettingsComponent: OpenButton,
    async start({ store, cleanup, logger }) {
        await loadSaved();
        syncFromStorage();

        // Profiles from the earlier, simpler CustomProfile become this account's custom profile
        const legacy = store as any;
        const LEGACY = { displayName: "globalName", avatarUrl: "avatar", bannerUrl: "banner", pronouns: "pronouns", bio: "bio" } as const;
        const migrate = () => {
            const me = myId();
            if (!me) return false;
            const data: Record<string, string> = {};
            for (const [from, to] of Object.entries(LEGACY)) if (typeof legacy[from] === "string" && legacy[from].trim()) data[to] = legacy[from].trim();
            if (Object.keys(data).length && !saved.accounts?.[me]) saveAccount(me, data);
            for (const from of Object.keys(LEGACY)) if (from in legacy) delete legacy[from];
            return true;
        };

        const users = getStore("UserStore");
        if (typeof users?.getCurrentUser !== "function") throw new Error("Discord's user store wasn't found");

        // Your account and the others you're logged in to, as user records
        let lastReal: any, lastFake: any, lastVersion = -1;
        cleanup(after("getCurrentUser", users, (_, raw) => {
            if (!raw) return raw;
            const real = raw.__cp_isClone ? raw.__cp_origUser ?? raw : raw;
            if (real === lastReal && lastVersion === dataVersion() && lastFake) return lastFake;
            lastReal = real;
            lastVersion = dataVersion();
            lastFake = userIfStaffWorks(fakeUser(real, true), real);
            return lastFake;
        }));
        if (typeof users.getUser === "function") cleanup(after("getUser", users, ([id], user) => {
            if (!user || !getProfileDataFor(id)) return user;
            return userIfStaffWorks(fakeUser(user, id === myId()), user);
        }));

        // Names, wherever Discord works them out
        const names = findByProps("useName", "getGlobalName") ?? findByProps("getUserTag", "getGlobalName");
        const nameOf = (user: any, name: unknown) => {
            const pd = user?.id && getProfileDataFor(user.id);
            return pd ? shownName(user, pd, user.id === myId()) ?? name : name;
        };
        for (const key of ["getName", "useName"]) {
            if (typeof names?.[key] === "function") cleanup(after(key, names, ([user], name) => nameOf(user, name)));
        }
        if (typeof names?.getGlobalName === "function") cleanup(after("getGlobalName", names, ([user], name) => {
            const pd = user?.id === myId() && getProfileDataFor(user.id);
            return pd && pd.globalName || name;
        }));
        if (typeof names?.getUserTag === "function") cleanup(after("getUserTag", names, ([user], tag) => {
            const pd = user?.id && getProfileDataFor(user.id);
            return pd && pd.username || tag;
        }));

        // Profiles: bio, pronouns, colors, banner, Nitro, decoration and effect
        const profiles = getStore("UserProfileStore");
        if (typeof profiles?.getUserProfile === "function") cleanup(after("getUserProfile", profiles, ([id], profile) => hookProfile(profile, id)));
        if (typeof profiles?.getGuildMemberProfile === "function") cleanup(after("getGuildMemberProfile", profiles, ([id], profile) => hookProfile(profile, id)));

        // Avatars
        const avatarOf = (user: any): string | undefined => getProfileDataFor(user?.id ?? user?.userId)?.avatar || undefined;
        const icons = findByProps("getUserAvatarURL", "getUserAvatarSource") ?? findByProps("getUserAvatarURL");
        if (typeof icons?.getUserAvatarURL === "function") cleanup(after("getUserAvatarURL", icons, ([user], url) => avatarOf(user) ?? url));
        if (typeof icons?.getUserAvatarSource === "function") cleanup(after("getUserAvatarSource", icons, ([user], source) => {
            const url = avatarOf(user);
            return url ? { uri: url } : source;
        }));
        // User records draw their own avatar too, and all of them share a prototype
        const patchUserProto = (proto: any) => {
            if (typeof proto?.getAvatarURL === "function") cleanup(after("getAvatarURL", proto, function (this: any, _, url) {
                return avatarOf(this) ?? url;
            }));
            if (typeof proto?.getAvatarSource === "function") cleanup(after("getAvatarSource", proto, function (this: any, _, source) {
                const url = avatarOf(this);
                return url ? { uri: url } : source;
            }));
        };
        const me = users.getCurrentUser();
        if (me) patchUserProto(Object.getPrototypeOf(me.__cp_origUser ?? me));
        else {
            const unsubscribe = subscribe("CONNECTION_OPEN", () => {
                unsubscribe();
                const user = users.getCurrentUser();
                if (user) patchUserProto(Object.getPrototypeOf(user.__cp_origUser ?? user));
            });
            cleanup(unsubscribe);
        }

        // Banners
        const bannerOf = (id?: string) => getProfileDataFor(id)?.banner || undefined;
        const banners = findByProps("getUserBannerURL");
        if (typeof banners?.getUserBannerURL === "function") cleanup(after("getUserBannerURL", banners, ([arg], url) => bannerOf(arg?.id ?? arg?.userId) ?? url));
        const DisplayProfile = moduleAt("modules/user_profile/DisplayProfile.tsx")?.default;
        if (typeof DisplayProfile?.prototype?.getBannerURL === "function") cleanup(after("getBannerURL", DisplayProfile.prototype, function (this: any, _, url) {
            return bannerOf(this?.userId) ?? url;
        }));

        // Avatar decorations, which are drawn from the shop's images
        const decorations = findByProps("getAvatarDecorationURL");
        if (typeof decorations?.getAvatarDecorationURL === "function") cleanup(instead("getAvatarDecorationURL", decorations, function (this: any, args, original) {
            const opts = args[0];
            const asset = getProfileDataFor(opts?.userId)?.decorationAsset ?? opts?.avatarDecoration?.asset;
            if (typeof asset === "string" && OUR_DECORATIONS.has(asset)) return getDecorationUrl(asset);
            return original.apply(this, args);
        }));

        // The account creation date
        const snowflakes = findByProps("extractTimestamp");
        if (typeof snowflakes?.extractTimestamp === "function") cleanup(instead("extractTimestamp", snowflakes, function (this: any, args, original) {
            const id = myId();
            const createdAt = args[0] === id ? getProfileDataFor(id)?.createdAt : undefined;
            return createdAt ? new Date(createdAt + DATE_SUFFIX).getTime() : original.apply(this, args);
        }));

        // The account switcher
        const accounts = getStore("MultiAccountStore");
        for (const key of ["getUsers", "getValidUsers"]) {
            if (typeof accounts?.[key] !== "function") continue;
            let lastRaw: any, lastPatched: any, lastV = -1;
            cleanup(after(key, accounts, (_, list) => {
                if (!Array.isArray(list)) return list;
                if (list === lastRaw && lastV === dataVersion() && lastPatched) return lastPatched;
                lastRaw = list;
                lastV = dataVersion();
                lastPatched = list.map(u => u?.id && getProfileDataFor(u.id) ? fakeUser(u, true) : u);
                return lastPatched;
            }));
        }

        // Your messages in the chat: the name and avatar Discord's native rows draw
        cleanup(onMessageRow("custom-profile", (row, message) => {
            const author = message?.author;
            const pd = author?.id && getProfileDataFor(author.id);
            if (!pd) return;
            const real = author.__cp_origUser ?? author;
            const name = shownName(real, pd, author.id === myId());
            if (name && typeof row.username === "string" && row.username === (real.globalName || real.username)) row.username = name;
            if (pd.avatar && typeof row.avatarURL === "string") row.avatarURL = pd.avatar;
        }, RowOrder.REPLACE));

        // Badges: on the profile, and in Discord's "Customize your badges" panel
        const refreshBadges = () => {
            const id = myId();
            const pd = getProfileDataFor(id);
            setManagedBadges(pd ? buildBadges(pd, t) : []);
        };
        cleanup(startBadgeManagement({ currentUser: myId, saveLayout: layout => { const id = myId(); if (id) saveLayout(id, layout); } }));
        setBadgeLayout(layoutOf(myId()));
        refreshBadges();
        cleanup(extendProfileBadges("custom-profile", (userId, badges) => {
            const pd = getProfileDataFor(userId);
            if (!pd || !hasCustomBadgesConfigured(pd)) return badges;
            const isMe = userId === myId();
            const ours = buildBadges(pd, t).map(b => linkedBadge(isMe ? profileBadgeId(b.key) : `${profileBadgeId(b.key)}_${userId}`, b.label, b.icon));
            // Discord's own badges give way to the custom ones; other plugins' badges stay
            const others = badges.filter(b => isPluginBadge(b) && !String(b.id).startsWith(PROFILE_ID_PREFIX));
            return [...isMe ? applyLayout(ours) : ours, ...others];
        }));

        // After a save, a reset or an account switch, everything that shows a profile draws it again
        const redraw = () => {
            fakeCache.clear();
            lastFake = undefined;
            for (const name of ["UserStore", "UserProfileStore", "MultiAccountStore"]) {
                try {
                    getStore(name)?.emitChange?.();
                } catch { }
            }
            refreshBadges();
            redrawChannel();
        };
        setChangeHandler(redraw);
        cleanup(
            () => {
                setChangeHandler(() => { });
                fakeCache.clear();
            },
            subscribe("CONNECTION_OPEN", () => {
                if (!migrate()) logger.warn("Logged in, but the account wasn't known yet");
                syncFromStorage();
                setBadgeLayout(layoutOf(myId()));
                redraw();
            }),
        );
        if (migrate()) redraw();

        // Where the editor opens from: a button beside the message box and EndcordToolbox, like Endcord PC's header
        // bar button and toolbox entry
        cleanup(
            addChatButton({
                key: "custom-profile",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const ActionButton = getChatInputActionButton();
                    const Icon = generatedIcon("PencilIcon");
                    return ActionButton && Icon ? <ActionButton accessibilityLabel={t("Custom Profile")} IconComponent={Icon} onPress={() => {
                        try {
                            openEditor();
                        } catch (e) {
                            toastError(e);
                        }
                    }} /> : null;
                },
            }),
            addToolboxAction("custom-profile", { label: () => t("Open Custom Profile"), icon: "PencilIcon", run: () => openEditor() }),
        );
    },
});

export default plugin;
