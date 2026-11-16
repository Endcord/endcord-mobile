/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FakeFriends' bookkeeping, apart from Discord so it can be tested: which requests are about a fake friend, and
 * Discord's relationship lists with the fake ones added.
 */

// Discord's relationship types
export const NONE = 0, FRIEND = 1, BLOCKED = 2, INCOMING = 3;

export type FakeState = "friend" | "pending";

export interface Fake {
    state: FakeState;
    /** When it was made, as Discord writes the date a relationship started */
    since: string;
}

const SNOWFLAKE = /^\d{17,20}$/;

export const typeOf = (state: FakeState) => state === "friend" ? FRIEND : INCOMING;

/**
 * The user a call to Discord's relationships API is about, from its address: "/users/@me/relationships/<id>" and what
 * comes after it ("/ignore"), with or without the API's base address in front
 */
export function relationshipTarget(url: unknown): string | undefined {
    if (typeof url !== "string" || url.length > 500) return undefined;
    const match = /\/users\/@me\/relationships\/(\d{17,20})(?=$|[/?#])/.exec(url);
    return match?.[1];
}

/** The URL of a request to Discord's HTTP module, which takes either the URL or an object with it */
export const urlOf = (request: unknown): unknown => typeof request === "string" ? request : (request as any)?.url;

/**
 * Whether a request about someone blocks or ignores them (or stops ignoring them), which is real whatever a fake shows:
 * a PUT of a block to their relationship, or anything to its /ignore
 */
export function isBlockOrIgnore(method: string, request: unknown): boolean {
    const url = urlOf(request);
    if (typeof url !== "string") return false;
    if (/\/users\/@me\/relationships\/\d{17,20}\/ignore(?=$|[/?#])/.test(url)) return true;
    return method === "put" && Number((request as any)?.body?.type) === BLOCKED;
}

/** The user an action is about: Discord passes the ID, an object with userId, or a user */
export function userIdOf(arg: unknown): string | undefined {
    let id: unknown = arg;
    if (arg && typeof arg === "object") {
        const a = arg as any;
        id = a.userId ?? a.user?.id ?? a.id;
    }
    return typeof id === "string" && SNOWFLAKE.test(id) ? id : undefined;
}

/**
 * Discord's map of relationships (user ID → type) with the fake ones added, as the same kind of collection: a Map, or a
 * plain object. A fake never replaces a real one; one whose values aren't plain types is given back as it was
 */
export function withFakeTypes<T>(real: T, fakes: ReadonlyArray<[string, FakeState]>): T {
    if (!fakes.length || !real || typeof real !== "object") return real;
    if (real instanceof Map) {
        for (const value of real.values()) {
            if (typeof value !== "number") return real;
            break;
        }
        const copy = new Map(real);
        for (const [id, state] of fakes) if (!copy.has(id)) copy.set(id, typeOf(state));
        return copy as T;
    }
    const values = Object.values(real as object);
    if (values.length && typeof values[0] !== "number") return real;
    const copy: Record<string, number> = { ...real as Record<string, number> };
    for (const [id, state] of fakes) if (!Object.prototype.hasOwnProperty.call(copy, id)) copy[id] = typeOf(state);
    return copy as T;
}

/** Discord's map of when relationships started (user ID → date), with the fake ones' dates */
export function withFakeSinces<T>(real: T, fakes: ReadonlyArray<[string, Fake]>): T {
    if (!fakes.length || !real || typeof real !== "object") return real;
    if (real instanceof Map) {
        const copy = new Map(real);
        for (const [id, fake] of fakes) if (!copy.has(id)) copy.set(id, fake.since);
        return copy as T;
    }
    const copy: Record<string, unknown> = { ...real as Record<string, unknown> };
    for (const [id, fake] of fakes) if (!Object.prototype.hasOwnProperty.call(copy, id)) copy[id] = fake.since;
    return copy as T;
}

/** A list of IDs with the fake ones added after it, each once */
export function withFakeIds(real: unknown, ids: readonly string[]): unknown {
    if (!Array.isArray(real) || !ids.length) return real;
    const seen = new Set(real);
    const extra = ids.filter(id => !seen.has(id));
    return extra.length ? [...real, ...extra] : real;
}
