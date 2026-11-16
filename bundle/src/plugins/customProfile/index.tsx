/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's CustomProfile: your username, display name, avatar, banner, bio, pronouns, profile colors, Nitro,
 * badges, avatar decoration, profile effect, profile frame, nameplate, display name style, account creation date, email
 * and phone. Profiles are kept per account and
 * can be saved as presets. Like on Endcord PC, a saved profile is shared with the other Endcord users in the Endcord
 * server, on PCs and phones, and theirs show here (sharing.ts); the email, phone and creation date stay on this phone.
 */

import { t, tx } from "@core/i18n";
import { after, instead } from "@lib/api/patcher";
import { findByProps } from "@metro";
import { NavigationNative } from "@metro/common";
import { Button, Stack } from "@metro/common/components";

import { definePlugin, onSettingChange } from "../api";
import { addChatButton, addToolboxAction, getChatInputActionButton, getStore, moduleAt, subscribe } from "../common";
import { currentChannelId, generatedIcon, loadedMessages, onMessageRow, redrawChannel, RowOrder, toastError } from "../hooks";
import { extendProfileBadges, isPluginBadge, linkedBadge } from "../profileBadges";
import { openPage } from "../ui/pages";
import { applyLayout, PROFILE_ID_PREFIX, profileBadgeId, setBadgeLayout, setManagedBadges, startBadgeManagement } from "./badges";
import {
    AVATAR_DECORATIONS, BOOST_MONTHS, buildBadges, CollectibleType, type CustomProfileData, type DisplayNameStyles, getDecorationUrl,
    hasCustomBadgesConfigured, type NameplateData, nitroSinceDate, wantsNitroLook
} from "./data";
import { KNOWN_PALETTES, nameEffects, nameFonts, nameplatePalettes } from "./discordTables";
import { getSharedProfile, startSharing, stopSharing } from "./sharing";
import {
    bumpDataVersion, currentSharable, dataVersion, getProfileDataFor, isSavedHere, layoutOf, loadSaved, myId, saveAccount, saved, saveLayout,
    setChangeHandler, setSharedProfiles, syncFromStorage
} from "./store";

const BUTTON_OPTIONS = [
    { label: tx("Hidden"), value: "none" },
    { label: tx("Left of the message box"), value: "left" },
    { label: tx("Right of the message box"), value: "right" },
];

const OUR_DECORATIONS = new Set(AVATAR_DECORATIONS.map(d => d.id));
/** A shop item's skuId, a snowflake */
const SHOP_SKU = /^\d{17,20}$/;
const DATE_SUFFIX = "T12:00:00Z";

// What a profile says goes to Discord's own drawing code, which expects what Discord itself would have put there. A
// shared profile is anyone's message, so these are held to what Discord knows before they're handed over: a value it
// has no entry for could stop it drawing the member list or a name, for everyone who sees that profile.

/** Discord's own ids for display name fonts and effects; null while they can't be found */
let nameStyleIds: { fonts: Set<number>; effects: Set<number>; } | null = null;
let nameStyleIdsTriedAt = 0;

/** A display name style Discord has the font and the effect for, or undefined */
function knownNameStyle(styles: DisplayNameStyles | undefined): DisplayNameStyles | undefined {
    if (!styles || !Array.isArray(styles.colors) || !styles.colors.length) return undefined;
    // Looked up again now and then until it's found: early on, Discord hasn't loaded that part yet
    if (!nameStyleIds && Date.now() - nameStyleIdsTriedAt > 30_000) {
        nameStyleIdsTriedAt = Date.now();
        const fonts = new Set(nameFonts().map(option => option.id)), effects = new Set(nameEffects().map(option => option.id));
        if (fonts.size && effects.size) nameStyleIds = { fonts, effects };
    }
    if (!nameStyleIds?.fonts.has(styles.fontId) || !nameStyleIds.effects.has(styles.effectId)) return undefined;
    return { fontId: styles.fontId, effectId: styles.effectId, colors: styles.colors.slice(0, 2) };
}

/** The background colors Discord has for nameplates, by the names in its API, from Discord itself once it's found */
let palettes: Set<string> | null = null;
let palettesTriedAt = 0;

function knownPalettes(): ReadonlySet<string> {
    // Looked up again now and then until it's found, as for the name styles; until then, the colors known to this code
    if (!palettes && Date.now() - palettesTriedAt > 30_000) {
        palettesTriedAt = Date.now();
        palettes = nameplatePalettes();
    }
    return palettes ?? KNOWN_PALETTES;
}

/**
 * A nameplate as Discord draws it: its own shop's, when the shop has that one, so only the number comes from the
 * profile; otherwise the profile's, when its colors are ones Discord has
 */
function knownNameplate(plate: NameplateData | undefined, pickedHere: boolean): NameplateData | undefined {
    if (!plate) return undefined;
    try {
        const products = getStore("CollectiblesCategoryStore")?.products;
        const product = products instanceof Map ? products.get(plate.skuId) : undefined;
        const item = product?.items?.length === 1 ? product.items[0] : undefined;
        if (item?.type === CollectibleType.NAMEPLATE && typeof item.asset === "string" && typeof item.palette === "string") {
            return { skuId: plate.skuId, asset: item.asset, label: typeof item.label === "string" ? item.label : undefined, palette: item.palette };
        }
    } catch { }
    // One picked in the editor on this phone came from the shop as it was then, newer colors included
    return pickedHere || plate.palette && knownPalettes().has(plate.palette) ? plate : undefined;
}

/**
 * A picture from a message's attachments, asked for at the size it's shown at: the file itself can be any size, and
 * Discord's proxy scales it down, as it does for the pictures in a chat
 */
function sizedPicture(url: string | undefined, width: number, height: number): string | undefined {
    if (!url) return undefined;
    const match = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)(\/attachments\/[^?#]+)(\?[^#]*)?$/.exec(url);
    if (!match) return url;
    return `https://media.discordapp.net${match[1]}${match[2] ? `${match[2]}&` : "?"}width=${width}&height=${height}`;
}

// The editor is loaded when it first opens, not with the plugin at startup
const EditorPage = ({ close }: { close: () => void; }) => {
    const CustomProfileEditor = require("./Editor").default as typeof import("./Editor").default;
    return <CustomProfileEditor onClose={close} />;
};

/** Opens the editor: from the plugin's settings, as the next page there; from the chat or EndcordToolbox, as a window */
const openEditor = (navigation?: any) => openPage(t("Custom Profile"), EditorPage, navigation);

function OpenButton() {
    const navigation = NavigationNative.useNavigation();
    const JoinCard = require("./JoinCard").default as typeof import("./JoinCard").default;
    return <Stack spacing={12}>
        <Button text={t("Open Custom Profile")} variant="primary" onPress={() => openEditor(navigation)} />
        <JoinCard />
    </Stack>;
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
        // Discord draws these straight from the user, as on Endcord PC: the nameplate in the member and DM lists, the
        // name style wherever the display name shows
        const nameplate = knownNameplate(pd.nameplate, isSavedHere(user.id));
        if (nameplate) setProp("collectibles", { ...real.collectibles, nameplate: { ...nameplate, expiresAt: null } });
        const nameStyle = knownNameStyle(pd.displayNameStyles);
        if (nameStyle) setProp("displayNameStyles", nameStyle);
        const flags = pd.badgeFlags != null && pd.badgeFlags > 0 ? pd.badgeFlags : undefined;
        setProp("publicFlags", flags ?? real.publicFlags);
        setProp("flags", flags ?? real.flags);
        if (wantsNitroLook(pd)) {
            setProp("premiumSince", nitroSinceDate(pd));
            const boost = pd.boostMonths ?? -1;
            setProp("premiumGuildSince", boost >= 0 ? monthsAgo(BOOST_MONTHS[boost] ?? 1) : null);
        } else if (pd.nitro === false) {
            // "No Nitro" is null to Discord, as on Endcord PC. 0 isn't a premium type, and its file size limit lookup
            // (limits[premiumType].fileSize) throws on it, which leaves every upload stuck
            setProp("premiumType", null);
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
        // Discord looks the frame up in its shop by this skuId
        if (pd.profileFrameId) {
            merged.profileFrame = { expiresAt: null, skuId: pd.profileFrameId };
            merged.premiumType ??= 2;
        }

        if (wantsNitroLook(pd)) {
            merged.premiumType = 2;
            if (pd.accentColor != null) merged.themeColors = [pd.accentColor, pd.accentColor2 ?? pd.accentColor];
            merged.premiumSince = nitroSinceDate(pd);
            const boost = pd.boostMonths ?? -1;
            merged.premiumGuildSince = boost >= 0 ? monthsAgo(BOOST_MONTHS[boost] ?? 1) : null;
        } else if (pd.nitro === false) {
            merged.premiumType = profile.premiumType ?? null;
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
    description: tx("Visually customize your Discord profile (username, PFP, banner, badges, bio...). Other Endcord users see it too."),
    popular: 1,
    icon: "UserCircleIcon",
    tags: ["Appearance", "Customisation"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "right", options: BUTTON_OPTIONS },
        showOthers: { type: "boolean", label: tx("Show the profiles other Endcord users made with CustomProfile"), default: true },
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

        // A part of Discord that's missing turns off only what needs it, not the whole profile
        const optional = (what: string, fn: () => void) => {
            try {
                fn();
            } catch (e) {
                logger.warn(`${what} couldn't be set up, the rest of the profile still works`, e);
            }
        };

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
        const avatarOf = (user: any): string | undefined => sizedPicture(getProfileDataFor(user?.id ?? user?.userId)?.avatar, 512, 512);
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
        const bannerOf = (id?: string) => sizedPicture(getProfileDataFor(id)?.banner, 1200, 480);
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
            const custom = getProfileDataFor(opts?.userId)?.decorationAsset;
            // A custom profile's decoration is a shop item, drawn from the shop's image as on Endcord PC
            if (typeof custom === "string" && custom) return getDecorationUrl(custom, custom.startsWith("a_"));
            // Some screens only pass the decoration, which for a custom one is a shop skuId: Discord's own decorations
            // are named by a hash, never by a number alone
            const asset = opts?.avatarDecoration?.asset;
            if (typeof asset === "string" && (OUR_DECORATIONS.has(asset) || SHOP_SKU.test(asset))) return getDecorationUrl(asset);
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
        optional("Names and avatars in the chat", () => cleanup(onMessageRow("custom-profile", (row, message) => {
            const author = message?.author;
            const pd = author?.id && getProfileDataFor(author.id);
            if (!pd) return;
            const real = author.__cp_origUser ?? author;
            const name = shownName(real, pd, author.id === myId());
            if (name && typeof row.username === "string" && row.username === (real.globalName || real.username)) row.username = name;
            if (pd.avatar && typeof row.avatarURL === "string") row.avatarURL = sizedPicture(pd.avatar, 128, 128);
        }, RowOrder.REPLACE)));

        // Badges: on the profile, and in Discord's "Customize your badges" panel
        const refreshBadges = () => optional("Badges", () => {
            const id = myId();
            const pd = getProfileDataFor(id);
            setManagedBadges(pd ? buildBadges(pd, t) : []);
        });
        optional("Badges", () => {
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
        });

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

        // Other Endcord users' profiles, shared through the Endcord server like on Endcord PC, while the setting is on.
        // This account's own profile is shared after each save (Editor.tsx), and whenever it changed while it couldn't be
        let sharedRedraw: ReturnType<typeof setTimeout> | undefined;
        const changedUsers = new Set<string>();
        const onSharedProfilesChanged = (userIds: string[]) => {
            for (const id of userIds) {
                fakeCache.delete(id);
                changedUsers.add(id);
            }
            bumpDataVersion();
            // Profiles come in a few at a time: one redraw for each batch, and the chat only when it shows one of them
            sharedRedraw ??= setTimeout(() => {
                sharedRedraw = undefined;
                const ids = new Set(changedUsers);
                changedUsers.clear();
                for (const name of ["UserStore", "UserProfileStore"]) {
                    try {
                        getStore(name)?.emitChange?.();
                    } catch { }
                }
                const channelId = currentChannelId();
                if (channelId && (!ids.size || loadedMessages(channelId).slice(-60).some(m => ids.has(m?.author?.id)))) redrawChannel();
            }, 250);
        };
        setSharedProfiles(userId => store.showOthers ? getSharedProfile(userId) : null);
        const share = () => optional("Shared profiles", () => {
            startSharing(onSharedProfilesChanged, { read: !!store.showOthers, mine: currentSharable, offer: id => require("./publish").offerToShare(id), logger })
                .catch(e => logger.warn("Shared profiles couldn't be loaded", e));
        });
        share();
        cleanup(
            onSettingChange(store, key => {
                if (key !== "showOthers") return;
                // Reading the channel starts or stops with it
                share();
                onSharedProfilesChanged([]);
            }),
            () => {
                setSharedProfiles(() => null);
                stopSharing();
                clearTimeout(sharedRedraw);
                sharedRedraw = undefined;
                bumpDataVersion();
            },
        );

        // Where the editor opens from: a button beside the message box and EndcordToolbox, like Endcord PC's header
        // bar button and toolbox entry
        optional("The chat bar button", () => cleanup(
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
        ));
    },
});

export default plugin;
