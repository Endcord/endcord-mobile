/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Server tools from Endcord PC: moderation, roles, invites, emojis and finding your way around servers.
 *
 * What more than one of the AutoDisconnectAndAutoMute, BetterBanReasons, BetterRoleContext, InviteDefaults and MoreUserTags plugins uses.
 */

import { findByProps } from "@metro";

import { getStore, guildRoles } from "../common";

export const unix = (ms: number) => Math.floor(ms / 1000);

/** A member's permissions in a server, from their roles; undefined when Discord's tables aren't there */
export function memberPermissions(guildId: string, userId: string): any {
    const roles = guildRoles(guildId);
    const member = getStore("GuildMemberStore")?.getMember?.(guildId, userId);
    let bits: any = roles[guildId]?.permissions;
    for (const id of member?.roles ?? []) {
        try {
            if (roles[id]?.permissions != null) bits = bits == null ? roles[id].permissions : bits | roles[id].permissions;
        } catch { }
    }
    return bits;
}

export function hasPermission(bits: any, name: string): boolean {
    const flag = findByProps("Permissions", "ChannelTypes")?.Permissions?.[name];
    if (bits == null || flag == null) return false;
    try {
        return (bits & flag) === flag;
    } catch {
        return false;
    }
}

export const canHere = (name: string, channel: any) => {
    const flag = findByProps("Permissions", "ChannelTypes")?.Permissions?.[name];
    return !!(flag != null && channel && getStore("PermissionStore")?.can?.(flag, channel));
};
