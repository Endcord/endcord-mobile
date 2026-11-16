/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * What CustomProfile saves, per account like on Endcord PC: each account's profile and whether it's on, its presets
 * and its badge layout.
 */

import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";

import { getStore } from "../common";
import type { BadgeLayout } from "./badges";
import { type CustomProfileData, hasAnyCustomData, type SavedPreset } from "./data";

interface Saved {
    accounts: Record<string, CustomProfileData>;
    enabled: Record<string, boolean>;
    presets: Record<string, SavedPreset[]>;
    layouts: Record<string, BadgeLayout>;
}

export const saved = wrapSync(createStorage<Saved>(createMMKVBackend("ENDCORD_CUSTOM_PROFILE", { accounts: {}, enabled: {}, presets: {}, layouts: {} })));

export const loadSaved = () => awaitStorage(saved);

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? {}));

// Plain copies of what's saved, read on every user and profile lookup without going through the storage's proxies
let accounts: Record<string, CustomProfileData> = {};
let enabled: Record<string, boolean> = {};
let version = 0;
let onChange = () => { };

/** Changes whenever a saved profile does, so cached fake users and profiles are rebuilt */
export const dataVersion = () => version;

/** What runs after a save: CustomProfile redraws what shows the profiles */
export function setChangeHandler(handler: () => void) {
    onChange = handler;
}

export function syncFromStorage() {
    accounts = plain(saved.accounts ?? {});
    enabled = plain(saved.enabled ?? {});
    version++;
}

export const myId = (): string | undefined => getStore("AuthenticationStore")?.getId?.() ?? undefined;

/** Another Endcord user's shared profile, while they're shown; set by CustomProfile when sharing starts */
let sharedProfileOf: (userId: string) => CustomProfileData | null = () => null;

export function setSharedProfiles(resolver: (userId: string) => CustomProfileData | null) {
    sharedProfileOf = resolver;
}

/** Shared profiles came in or changed: cached fake users and profiles are rebuilt */
export function bumpDataVersion() {
    version++;
}

/**
 * The custom profile shown for a user: one of your accounts that has one turned on comes first, as on Endcord PC; the
 * account you're signed in to shows what's saved here, never what it shared from another device; anyone else, what
 * they shared with Endcord users
 */
export function getProfileDataFor(userId: string | null | undefined): CustomProfileData | null {
    if (!userId) return null;
    if (enabled[userId]) {
        const data = accounts[userId];
        return hasAnyCustomData(data) ? data : null;
    }
    if (userId === myId()) return null;
    // As on Endcord PC, whatever they shared: a profile that only turns Nitro off, or only sets a nameplate, is one too
    return sharedProfileOf(userId);
}

/** Whether the profile shown for a user is one saved on this phone, rather than one they shared */
export const isSavedHere = (userId: string | null | undefined) => !!userId && !!enabled[userId];

/** The signed-in account and the profile it has on, to share with other Endcord users */
export function currentSharable(): { id: string; data: CustomProfileData | null; } | null {
    const id = myId();
    if (!id) return null;
    return { id, data: enabled[id] && hasAnyCustomData(accounts[id]) ? plain(accounts[id]) : null };
}

export const accountData = (id: string): CustomProfileData => plain(accounts[id] ?? {});

export function saveAccount(id: string, data: CustomProfileData) {
    saved.accounts = { ...plain(saved.accounts ?? {}), [id]: plain(data) };
    saved.enabled = { ...plain(saved.enabled ?? {}), [id]: true };
    syncFromStorage();
    onChange();
}

export function resetAccount(id: string) {
    const nextAccounts = plain(saved.accounts ?? {});
    const nextEnabled = plain(saved.enabled ?? {});
    delete nextAccounts[id];
    delete nextEnabled[id];
    saved.accounts = nextAccounts;
    saved.enabled = nextEnabled;
    syncFromStorage();
    onChange();
}

/** Applies the saved profiles again without changing them */
export function repair() {
    syncFromStorage();
    onChange();
}

export const presetsOf = (id: string): SavedPreset[] => plain(saved.presets?.[id] ?? []);

export function setPresets(id: string, list: SavedPreset[]) {
    saved.presets = { ...plain(saved.presets ?? {}), [id]: plain(list) };
}

export const layoutOf = (id: string | undefined): BadgeLayout => (id && plain(saved.layouts?.[id])) || {};

export function saveLayout(id: string, layout: BadgeLayout) {
    saved.layouts = { ...plain(saved.layouts ?? {}), [id]: plain(layout) };
}
