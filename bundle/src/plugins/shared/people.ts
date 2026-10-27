/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Friends and the people you talk to: requests, blocks, tags, nicknames, profiles and streaks.
 *
 * What more than one of these plugins uses.
 */

import { t } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { useEffect, useState } from "react";

import { getStore } from "../common";
import { api, describeError, displayName, getUser } from "../hooks";

// Discord's relationship types
export const FRIEND = 1, BLOCKED = 2, INCOMING = 3, OUTGOING = 4;

export function relationships(): Array<[string, number]> {
    const all = getStore("RelationshipStore")?.getMutableRelationships?.() ?? {};
    return all instanceof Map ? [...all.entries()] : Object.entries(all).map(([id, type]) => [id, typeof type === "object" ? (type as any).type : Number(type)]);
}

export const since = (id: string) => Date.parse(getStore("RelationshipStore")?.getSince?.(id) ?? "") || 0;

export const nameOf = (id: string) => {
    const user = getUser(id);
    return user ? `${displayName(user)} (@${user.username})` : id;
};

export const removeRelationship = (id: string) => {
    const actions = findByProps("removeRelationship");
    return actions?.removeRelationship ? Promise.resolve(actions.removeRelationship(id)) : api("del", `/users/@me/relationships/${id}`);
};

export const failed = (e: any) => showToast(t("Request failed: {error}", { error: describeError(e) }), findAssetId("CircleXIcon-primary"));

/** Rerenders when relationships change */
export function useRelationships() {
    const [, update] = useState(0);
    useEffect(() => {
        const store = getStore("RelationshipStore");
        const listener = () => update(n => n + 1);
        store?.addChangeListener?.(listener);
        return () => store?.removeChangeListener?.(listener);
    }, []);
    return relationships();
}

export async function profileOf(userId: string): Promise<any> {
    const cached = getStore("UserProfileStore")?.getUserProfile?.(userId);
    if (cached?.connectedAccounts) return cached;
    return api("get", `/users/${userId}/profile?with_mutual_guilds=false`);
}

export const accountsOf = (profile: any): any[] => profile?.connectedAccounts ?? profile?.connected_accounts ?? [];
