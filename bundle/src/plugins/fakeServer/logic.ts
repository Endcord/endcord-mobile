/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FakeServer's changes to what Discord's stores give, apart from Discord so they can be tested. The same as Endcord
 * PC's: the badges are server features, the counts replace Discord's.
 */

export interface FakeLook {
    verified?: boolean;
    partnered?: boolean;
    members?: number;
    online?: number;
}

export const FAKE_FEATURES = ["VERIFIED", "PARTNERED"] as const;

export const MAX_COUNT = 99_999_999;

export const hasBadges = (look: FakeLook | undefined): look is FakeLook => !!look && (!!look.verified || !!look.partnered);

/** Whether a look shows anything Discord's own doesn't; one that doesn't needs no entry */
export const isEmptyLook = (look: FakeLook) => !look.verified && !look.partnered && look.members == null && look.online == null;

const extraFeatures = (look: FakeLook) => FAKE_FEATURES.filter(f => f === "VERIFIED" ? look.verified : look.partnered);

/** A server's features with the fake ones added, as the same kind of collection Discord gave (a Set or a list) */
export function addFeatures(features: unknown, look: FakeLook): Set<string> | string[] {
    const extra = extraFeatures(look);
    if (Array.isArray(features)) return [...new Set([...features, ...extra])];
    const base = features instanceof Set ? [...features] : [];
    return new Set([...base, ...extra]);
}

/** A number typed into a box, or undefined for an empty one: only its digits, at most PC's largest count */
export function toCount(text: string): number | undefined {
    const digits = String(text ?? "").slice(0, 40).replace(/[^\d]/g, "");
    return digits ? Math.min(Number(digits), MAX_COUNT) : undefined;
}

/** The server card (a server's profile): badges and counts */
export function withProfile(profile: Record<string, any>, look: FakeLook) {
    return {
        ...profile,
        ...hasBadges(look) && { features: addFeatures(profile.features ?? [], look) },
        ...look.members != null && { memberCount: look.members },
        ...look.online != null && { onlineCount: look.online },
    };
}

/** An invite to the server, as its card in chat shows it */
export function withInvite(invite: Record<string, any>, look: FakeLook) {
    return {
        ...invite,
        ...hasBadges(look) && invite.guild && { guild: { ...invite.guild, features: addFeatures(invite.guild.features ?? [], look) } },
        ...look.members != null && { approximate_member_count: look.members },
        ...look.online != null && { approximate_presence_count: look.online },
    };
}

/**
 * The member list's group headers ("Online — 12"): the online group shows the fake online count, the offline group the
 * rest of the fake member count. [keep] makes each changed list once, so Discord isn't handed a new one every time
 */
export function withMemberList(props: any, look: FakeLook, keep: <T>(original: object, make: () => T) => T = (_, make) => make()) {
    const groups: Array<{ id: string; count: number; }> | undefined = props?.groups;
    if (!Array.isArray(groups) || look.members == null && look.online == null) return props;

    const counts = new Map<string, number>();
    const onlineGroups = groups.filter(g => g?.id !== "offline");
    if (look.online != null && groups.some(g => g?.id === "online")) {
        // Members shown under a role are online too
        const underRoles = onlineGroups.filter(g => g?.id !== "online").reduce((sum, g) => sum + (Number(g?.count) || 0), 0);
        counts.set("online", Math.max(look.online - underRoles, 0));
    }
    if (look.members != null && groups.some(g => g?.id === "offline")) {
        const online = onlineGroups.reduce((sum, g) => sum + (counts.get(g?.id) ?? (Number(g?.count) || 0)), 0);
        counts.set("offline", Math.max(look.members - online, 0));
    }
    if (!counts.size) return props;

    const fix = (item: any) => item && typeof item === "object" && counts.has(item.id) && typeof item.count === "number"
        ? { ...item, count: counts.get(item.id) }
        : item;

    return {
        ...props,
        groups: keep(groups, () => groups.map(fix)),
        rows: Array.isArray(props.rows) ? keep(props.rows, () => props.rows.map((row: any) => row?.type === "GROUP" ? fix(row) : row)) : props.rows,
    };
}

/** The server a request to Discord's API changes, from its address: "/guilds/<id>" and nothing after */
export function guildTarget(url: unknown): string | undefined {
    if (typeof url !== "string" || url.length > 300) return undefined;
    return /\/guilds\/(\d{17,20})\/?(?:\?.*)?$/.exec(url)?.[1];
}

/** Features to send back to Discord: without the fake ones, unless the server really has them */
export function realFeatures(features: unknown[], realHas: (feature: string) => boolean): unknown[] {
    return features.filter(f => typeof f !== "string" || !(FAKE_FEATURES as readonly string[]).includes(f) || realHas(f));
}
