/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Lets CustomProfile's badges take part in Discord's "Customize your badges" panel, like on Endcord PC, so they can be
 * reordered and hidden like real ones.
 *
 * Discord keys every badge by a numeric id from its badge-type enum and maps profile badge ids to it with
 * `enum[id.toUpperCase()]`. Registering our badges in that enum and adding them to the current user's badge catalog is
 * enough for the panel to list, reorder and hide them. Discord's servers know nothing about these ids, so they are
 * taken out of the save request and the layout is kept locally instead.
 */

import { instead } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { getStore } from "../common";

export interface ManagedBadge {
    /** Stable key, lowercase letters, digits and underscores */
    key: string;
    label: string;
    icon: string;
}

export interface BadgeLayout {
    /** Full display order of badge type ids, Discord's and ours, as last saved */
    order?: number[];
    /** Our badges that were hidden */
    hidden?: number[];
}

export const PROFILE_ID_PREFIX = "ec_cp_";

// Discord's badge type ids are small (1..22). Ours start far above and are derived from the key, so a saved layout
// keeps working when badges are added or removed.
const ID_BASE = 90000;
const ID_SPAN = 9000;
const idCache = new Map<string, number>();
export function badgeTypeId(key: string) {
    let id = idCache.get(key);
    if (id == null) {
        let h = 0;
        for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
        id = ID_BASE + h % ID_SPAN;
        idCache.set(key, id);
    }
    return id;
}
const isOurId = (id: unknown): id is number => typeof id === "number" && id >= ID_BASE && id < ID_BASE + ID_SPAN;
export const profileBadgeId = (key: string) => PROFILE_ID_PREFIX + key;

let active: ManagedBadge[] = [];
let layout: BadgeLayout = {};
let currentUser: () => string | undefined = () => undefined;
let saveLayout: (layout: BadgeLayout) => void = () => { };

const entryCache = new Map<string, any>();

const BadgeDirectoryStore = () => getStore("BadgeDirectoryStore");

function emitCatalogChange() {
    try {
        BadgeDirectoryStore()?.emitChange?.();
    } catch { }
}

/** Called whenever the user's custom badges change */
export function setManagedBadges(badges: ManagedBadge[]) {
    active = badges;
    const types = findByProps("PREMIUM_TENURE", "GAME_VARIETY", "ACCOUNT_AGE") as Record<string | number, string | number> | undefined;
    for (const b of badges) {
        const id = badgeTypeId(b.key);
        const name = (PROFILE_ID_PREFIX + b.key).toUpperCase();
        try {
            if (types) {
                types[id] = name;
                types[name] = id;
            }
        } catch { }
    }
    emitCatalogChange();
}

/** Which layout to use, after the plugin starts or the account changes */
export function setBadgeLayout(next: BadgeLayout) {
    layout = next;
    emitCatalogChange();
}

// A catalog entry looks like one of Discord's own: owned, untiered, with a single icon. Entries are cached so
// selectors that compare arrays item by item stay stable.
function catalogEntry(b: ManagedBadge, hidden: boolean) {
    const cacheKey = `${b.key}\0${hidden}\0${b.label}\0${b.icon}`;
    let entry = entryCache.get(cacheKey);
    if (!entry) {
        entry = {
            badge_id: badgeTypeId(b.key),
            owned: true,
            hidden,
            name: b.label,
            description: b.label,
            simple_icon_url: b.icon,
            simple_icon_raster_url: b.icon,
            complex_icon_static_url: b.icon,
            tiers: [],
            current_tier: null,
            next_tier: null,
            requirements: [],
            progress: [],
            tier_obtained_at: {},
            obtained_at: null,
        };
        entryCache.set(cacheKey, entry);
    }
    return entry;
}

function sortByLayout<T>(items: T[], typeIdOf: (item: T) => number | undefined) {
    const { order } = layout;
    if (!order?.length) return items;
    const rank = new Map(order.map((id, i) => [id, i]));
    // Items that aren't in the saved order stay where they are; ordered ones fill the remaining slots
    const ordered = items.filter(it => rank.has(typeIdOf(it)!)).sort((a, b) => rank.get(typeIdOf(a)!)! - rank.get(typeIdOf(b)!)!);
    let next = 0;
    return items.map(it => rank.has(typeIdOf(it)!) ? ordered[next++] : it);
}

/** The profile's badges with the saved layout: hidden ones left out, the rest in the saved order */
export function applyLayout<T extends { id: string; }>(badges: T[]): T[] {
    const hidden = new Set(layout.hidden ?? []);
    const typeIdOf = (b: T) => b.id.startsWith(PROFILE_ID_PREFIX) ? badgeTypeId(b.id.slice(PROFILE_ID_PREFIX.length)) : undefined;
    return sortByLayout(badges.filter(b => !hidden.has(typeIdOf(b)!)), typeIdOf);
}

// While custom badges are set they replace the account's own badges, in the panel as on the profile. Without custom
// badges (or after a reset) the account's badges are left exactly as Discord has them.
function stripOurIds(body: any): boolean {
    if (!body || typeof body !== "object") return false;
    let found = false;
    for (const [field, value] of Object.entries(body)) {
        if (Array.isArray(value) && value.some(isOurId)) {
            found = true;
            if (/hid/i.test(field)) layout.hidden = value.filter(isOurId);
            else layout.order = [...value];
            const rest = value.filter(v => !isOurId(v));
            // A list of only our badges says nothing about the real ones: leave the server's value alone
            if (rest.length) body[field] = rest;
            else delete body[field];
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
            found = stripOurIds(value) || found;
        }
    }
    return found;
}

export function startBadgeManagement(options: { currentUser: () => string | undefined; saveLayout: (layout: BadgeLayout) => void; }) {
    ({ currentUser, saveLayout } = options);
    const unpatches: Array<() => unknown> = [];

    const store = BadgeDirectoryStore();
    if (typeof store?.getBadges === "function") {
        unpatches.push(instead("getBadges", store, function (this: any, args, original) {
            const real = original.apply(this, args);
            const me = currentUser();
            if (!active.length || (args[0] ?? me) !== me || !Array.isArray(real) || !real.length) return real;
            const hidden = new Set(layout.hidden ?? []);
            return sortByLayout(active.map(b => catalogEntry(b, hidden.has(badgeTypeId(b.key)))), e => e.badge_id);
        }));
    }
    if (typeof store?.getBadgeById === "function") {
        unpatches.push(instead("getBadgeById", store, function (this: any, args, original) {
            const [id, userId] = args;
            if (isOurId(id) && (userId ?? currentUser()) === currentUser()) {
                const b = active.find(x => badgeTypeId(x.key) === id);
                if (b) return catalogEntry(b, layout.hidden?.includes(id) ?? false);
            }
            return original.apply(this, args);
        }));
    }

    // Saving the panel: keep our ids out of the request and remember them locally
    const http = findByProps("getAPIBaseURL", "get");
    for (const method of ["patch", "put", "post"]) {
        if (typeof http?.[method] !== "function") continue;
        unpatches.push(instead(method, http, function (this: any, args, original) {
            const req = args[0];
            try {
                // Only while there are custom badges: without them, no request can carry their ids
                if (active.length && currentUser() && req && typeof req === "object" && req.body && stripOurIds(req.body)) {
                    saveLayout(layout);
                    emitCatalogChange();
                    // Nothing left for Discord: answer like a successful save without a request
                    if (/badge/i.test(String(req.url)) && !Object.keys(req.body).length) {
                        return Promise.resolve({ ok: true, status: 200, body: {}, headers: {} });
                    }
                }
            } catch (e) {
                console.error("[Endcord] CustomProfile couldn't filter the badge layout", e);
            }
            return original.apply(this, args);
        }));
    }

    emitCatalogChange();
    return () => {
        unpatches.forEach(u => u());
        active = [];
        emitCatalogChange();
    };
}
