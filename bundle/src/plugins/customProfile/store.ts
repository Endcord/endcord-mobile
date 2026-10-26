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

/** The custom profile shown for a user: one of your accounts that has one turned on */
export function getProfileDataFor(userId: string | null | undefined): CustomProfileData | null {
    if (!userId || !enabled[userId]) return null;
    const data = accounts[userId];
    return hasAnyCustomData(data) ? data : null;
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
