/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * What ShowHiddenChannels works out from a channel's permission overwrites and the server's roles: who can see a
 * channel you can't, and how its settings read. Nothing here touches Discord, so it can be tested on its own.
 */

/** Discord's channel types this plugin tells apart */
export const ChannelType = {
    TEXT: 0,
    VOICE: 2,
    CATEGORY: 4,
    ANNOUNCEMENT: 5,
    ANNOUNCEMENT_THREAD: 10,
    PUBLIC_THREAD: 11,
    PRIVATE_THREAD: 12,
    STAGE: 13,
    DIRECTORY: 14,
    FORUM: 15,
    MEDIA: 16,
} as const;

const THREAD_TYPES = new Set<number>([ChannelType.ANNOUNCEMENT_THREAD, ChannelType.PUBLIC_THREAD, ChannelType.PRIVATE_THREAD]);

export const isThreadType = (type: unknown) => typeof type === "number" && THREAD_TYPES.has(type);

/** A permission bitfield as a BigInt, whatever form it came in (BigInt, number or the API's decimal string) */
export function toBits(value: unknown): bigint {
    try {
        if (typeof value === "bigint") return value;
        if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
        if (typeof value === "string" && /^\d{1,40}$/.test(value)) return BigInt(value);
    } catch { }
    return 0n;
}

export const hasBits = (bits: bigint, flag: bigint) => flag !== 0n && (bits & flag) === flag;

export interface OverwriteLike {
    id: string;
    /** 0 (or "role") for a role, 1 (or "member") for a member */
    type: unknown;
    allow: unknown;
    deny: unknown;
}

export interface RoleLike {
    id: string;
    name?: unknown;
    permissions?: unknown;
    position?: unknown;
}

const isMemberOverwrite = (overwrite: OverwriteLike) => overwrite.type === 1 || overwrite.type === "member" || overwrite.type === "1";

/** Applies an overwrite to a bitfield, as Discord does: what it denies goes, then what it allows comes */
function apply(bits: bigint, overwrite: OverwriteLike | undefined): bigint {
    if (!overwrite) return bits;
    return (bits & ~toBits(overwrite.deny)) | toBits(overwrite.allow);
}

export interface Access {
    /** Everyone in the server can see it (so you're kept out by an overwrite of your own or of your roles) */
    everyone: boolean;
    /** The roles that let a member see it, highest first */
    roles: Array<{ id: string; name: string; admin: boolean; }>;
    /** The members let in by an overwrite of their own, and the owner, who always can */
    userIds: string[];
}

/**
 * Who can see a channel, the way Discord's own "who can see this" works it out: for each role, a member with only that
 * role and @everyone; administrators always can. Members with an overwrite of their own that allows viewing are listed
 * by ID, with the server's owner first.
 */
export function whoCanSee(input: {
    guildId: string;
    ownerId?: string;
    roles: Record<string, RoleLike>;
    overwrites: Record<string, OverwriteLike> | undefined;
    viewFlag: bigint;
    adminFlag: bigint;
}): Access {
    const { guildId, roles, viewFlag, adminFlag } = input;
    const overwrites = input.overwrites ?? {};
    const own = (id: string) => Object.prototype.hasOwnProperty.call(overwrites, id) ? overwrites[id] : undefined;
    const everyoneRole = Object.prototype.hasOwnProperty.call(roles, guildId) ? roles[guildId] : undefined;
    const everyoneBits = toBits(everyoneRole?.permissions);

    const canView = (bits: bigint, roleId?: string) => {
        if (hasBits(bits, adminFlag)) return true;
        let result = apply(bits, own(guildId));
        if (roleId) {
            const overwrite = own(roleId);
            if (overwrite && !isMemberOverwrite(overwrite)) result = apply(result, overwrite);
        }
        return hasBits(result, viewFlag);
    };

    const everyone = canView(everyoneBits);
    const allowed: Array<{ id: string; name: string; admin: boolean; position: number; }> = [];
    if (!everyone) {
        for (const role of Object.values(roles)) {
            if (!role || typeof role.id !== "string" || role.id === guildId) continue;
            const bits = everyoneBits | toBits(role.permissions);
            if (!canView(bits, role.id)) continue;
            allowed.push({
                id: role.id,
                name: typeof role.name === "string" ? role.name : role.id,
                admin: hasBits(bits, adminFlag),
                position: typeof role.position === "number" ? role.position : 0,
            });
        }
    }
    allowed.sort((a, b) => b.position - a.position);

    const userIds: string[] = [];
    if (input.ownerId) userIds.push(input.ownerId);
    for (const overwrite of Object.values(overwrites)) {
        if (!overwrite || !isMemberOverwrite(overwrite) || typeof overwrite.id !== "string") continue;
        if (hasBits(toBits(overwrite.allow), viewFlag) && !userIds.includes(overwrite.id)) userIds.push(overwrite.id);
    }

    return { everyone, roles: allowed.map(({ position: _, ...role }) => role), userIds };
}

/** The names of the permissions a bitfield has, from Discord's table of them */
export function permissionNames(bits: bigint, table: Record<string, unknown>): string[] {
    const names: string[] = [];
    for (const [name, value] of Object.entries(table)) {
        const flag = toBits(value);
        if (hasBits(bits, flag)) names.push(name);
    }
    return names;
}

/** A duration in whole units, largest first, like [1, "hour"], [30, "minute"]; at most two units */
export function durationParts(seconds: number): Array<[number, "day" | "hour" | "minute" | "second"]> {
    if (!Number.isFinite(seconds) || seconds <= 0) return [];
    const units: Array<[number, "day" | "hour" | "minute" | "second"]> = [[86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]];
    let left = Math.floor(seconds);
    const parts: Array<[number, "day" | "hour" | "minute" | "second"]> = [];
    for (const [size, unit] of units) {
        if (left < size) continue;
        parts.push([Math.floor(left / size), unit]);
        left %= size;
        if (parts.length === 2) break;
    }
    return parts;
}

/** Text from other people, flattened and cut to a length a row can show */
export function clip(text: unknown, max: number): string {
    if (typeof text !== "string") return "";
    const sliced = text.length > max + 1 ? text.slice(0, max + 1) : text;
    return sliced.length > max ? `${sliced.slice(0, max - 1)}…` : sliced;
}

export interface ChannelLike {
    id: string;
    type: number;
    name?: unknown;
    parent_id?: unknown;
    position?: unknown;
}

const position = (channel: ChannelLike | undefined) => typeof channel?.position === "number" ? channel.position : 0;

/**
 * Groups the hidden channels under their categories, in the channel list's order: channels without a category first,
 * then each category by its position; channels in each by position, then ID
 */
export function groupByCategory<C extends ChannelLike>(hidden: C[], categories: Record<string, C | undefined>): Array<{ category?: C; channels: C[]; }> {
    const groups = new Map<string, { category?: C; channels: C[]; }>();
    for (const channel of hidden) {
        const parentId = typeof channel.parent_id === "string" ? channel.parent_id : "";
        const category = parentId && Object.prototype.hasOwnProperty.call(categories, parentId) ? categories[parentId] : undefined;
        const key = category ? parentId : "";
        let group = groups.get(key);
        if (!group) groups.set(key, group = { category, channels: [] });
        group.channels.push(channel);
    }
    const byPosition = (a: ChannelLike, b: ChannelLike) => position(a) - position(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const list = [...groups.values()];
    for (const group of list) group.channels.sort(byPosition);
    return list.sort((a, b) => a.category && b.category ? byPosition(a.category, b.category) : (a.category ? 1 : 0) - (b.category ? 1 : 0));
}
