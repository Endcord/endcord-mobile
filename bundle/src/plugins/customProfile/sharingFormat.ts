/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The profile messages Endcord users share, in Endcord PC's format (customProfile/sharing.ts there), so a profile saved
 * on a phone shows on a PC and the other way round. Only plain functions here, without Discord or React Native, so they
 * can be checked against Endcord PC's own.
 *
 * Everyone's client reads these messages, so what one may say is checked strictly when it's read: only the fields a
 * shared profile may set, each of the right type and size; pictures only from Discord's own servers, since a link to
 * anywhere else would tell a stranger who looked at the profile; and never an email, phone number or account creation
 * date.
 */

import type { CustomProfileData } from "./data";

/** Starts every profile message, with the format's version, so a later format can sit next to this one */
export const PREFIX = "ecp1 ";
/** Discord's limit for a message */
export const MAX_CONTENT = 2000;

export const DISCORD_CDN = /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/[^\s"'<>]+$/;
const TOKEN = /^[\w.-]{1,80}$/;
export const SNOWFLAKE = /^\d{1,25}$/;
const ASSET_PATH = /^(?!.*\.\.)[\w\-./]{1,160}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
// Where Endcord PC takes any name of letters, digits, dots and dashes, the values below go into a link or are looked up
// by name in Discord's own tables once they're shown, so they're held to what the real ones look like
const DECORATION = /^[A-Za-z0-9_-]{1,80}$/;
const PALETTE = /^[a-z][a-z_]{0,23}$/;
/** Longer than any picture link Discord makes, signatures included */
const MAX_PICTURE_LINK = 1024;
// Control characters, and the marks that turn the direction of text around: a name could hide what it says behind them
const HIDDEN = /[\u0000-\u001f\u007f\u200b-\u200f\u2060\u202a-\u202e\u2066-\u2069\ufeff]/g;
// The same, without the line break a bio may have
const HIDDEN_IN_BIO = /[\u0000-\u0009\u000b-\u001f\u007f\u200b-\u200f\u2060\u202a-\u202e\u2066-\u2069\ufeff]/g;
/** A name every object has, like toString: as a key it would stand in for the real one */
const isObjectsOwnName = (key: string) => key in {} || UNSAFE_KEYS.has(key);

/** What never leaves this phone: only you see these, as on Endcord PC */
const PRIVATE_KEYS = ["email", "phone", "createdAt", "copiedUserId"] as const;

/** Every field a shared profile may set, as on Endcord PC */
export const SHARED_KEYS = [
    "username", "globalName", "bio", "pronouns", "oldName", "avatar", "banner", "accentColor", "accentColor2", "badgeFlags",
    "nitroLevel", "nitroSince", "boostMonths", "nitro", "decorationAsset", "profileEffectId", "profileFrameId",
    "customBadgeIds", "tieredBadges", "nameplate", "displayNameStyles",
] as const;

const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max ? value : undefined;
/** Text that's shown to people, without the characters that hide: undefined when nothing is left of it */
const shown = (value: unknown, max: number, hidden = HIDDEN) => text(value, max)?.replace(hidden, "") || undefined;
const int = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? value as number : undefined;
const matching = (value: unknown, pattern: RegExp) => typeof value === "string" && pattern.test(value) ? value : undefined;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Keeps only what a shared profile may set, each of the right type and size, or null when nothing is left */
export function sanitizeShared(raw: unknown): CustomProfileData | null {
    if (!isRecord(raw)) return null;
    const r = raw;
    const out: CustomProfileData = {};

    const set = <K extends keyof CustomProfileData>(key: K, value: CustomProfileData[K] | undefined) => {
        if (value !== undefined) out[key] = value;
    };

    set("username", shown(r.username, 32));
    set("globalName", shown(r.globalName, 32));
    set("bio", shown(r.bio, 400, HIDDEN_IN_BIO));
    set("pronouns", shown(r.pronouns, 40));
    set("oldName", shown(r.oldName, 32));
    set("avatar", matching(text(r.avatar, MAX_PICTURE_LINK), DISCORD_CDN));
    set("banner", matching(text(r.banner, MAX_PICTURE_LINK), DISCORD_CDN));
    set("accentColor", int(r.accentColor, 0, 0xFFFFFF));
    set("accentColor2", int(r.accentColor2, 0, 0xFFFFFF));
    set("badgeFlags", int(r.badgeFlags, 0, 2 ** 31 - 1));
    set("nitroLevel", int(r.nitroLevel, 0, 20));
    set("nitroSince", matching(r.nitroSince, DATE));
    set("boostMonths", int(r.boostMonths, 0, 30));
    if (typeof r.nitro === "boolean") out.nitro = r.nitro;
    // It ends up in a link, and Discord's decorations are a hash or a shop number: no dots, and no name of an object's own
    const decoration = matching(r.decorationAsset, DECORATION);
    if (decoration && !isObjectsOwnName(decoration)) out.decorationAsset = decoration;
    set("profileEffectId", matching(r.profileEffectId, SNOWFLAKE));
    set("profileFrameId", matching(r.profileFrameId, SNOWFLAKE));

    if (Array.isArray(r.customBadgeIds) && r.customBadgeIds.length <= 40) {
        // Each once, and none that names something every object has
        const ids = [...new Set(r.customBadgeIds.filter(id => matching(id, TOKEN) && !isObjectsOwnName(id as string)))];
        if (ids.length) out.customBadgeIds = ids as string[];
    }
    if (isRecord(r.tieredBadges)) {
        const tiers: Record<string, number> = {};
        for (const [key, tier] of Object.entries(r.tieredBadges).slice(0, 20)) {
            // "__proto__" and the like match the pattern too, but would change the object instead of naming a badge
            if (matching(key, TOKEN) && !isObjectsOwnName(key) && int(tier, 0, 20) !== undefined) tiers[key] = tier as number;
        }
        if (Object.keys(tiers).length) out.tieredBadges = tiers;
    }

    const plate = r.nameplate;
    if (isRecord(plate)) {
        const skuId = matching(plate.skuId, SNOWFLAKE), asset = matching(plate.asset, ASSET_PATH);
        if (skuId && asset) {
            out.nameplate = { skuId, asset };
            const label = shown(plate.label, 80), palette = matching(plate.palette, PALETTE);
            if (label) out.nameplate.label = label;
            // Discord looks the colors up by this name
            if (palette && !isObjectsOwnName(palette)) out.nameplate.palette = palette;
        }
    }

    const styles = r.displayNameStyles;
    if (isRecord(styles) && Array.isArray(styles.colors) && styles.colors.length <= 4) {
        const fontId = int(styles.fontId, 0, 1_000_000), effectId = int(styles.effectId, 0, 1_000_000);
        const colors = styles.colors.filter(color => int(color, 0, 0xFFFFFF) !== undefined) as number[];
        // A style always has a color, as Endcord PC and Discord write it
        if (fontId !== undefined && effectId !== undefined && colors.length) out.displayNameStyles = { fontId, effectId, colors };
    }

    return Object.keys(out).length ? out : null;
}

/** A message's attachments, by file name, for a profile that points at its own uploaded pictures */
export type Attachments = { filename: string; url: string; }[];

/**
 * A profile message's text and pictures, as the profile it describes, or null when it isn't one. A profile message with
 * nothing in it that may be shown, like the "ecp1 {}" Endcord PC posts for an emptied profile, is an empty profile: as
 * its author's newest message, it takes the place of the one before
 */
export function readProfileMessage(content: string, attachments: Attachments = []): CustomProfileData | null {
    if (typeof content !== "string" || !content.startsWith(PREFIX)) return null;
    let raw: any;
    try {
        raw = JSON.parse(content.slice(PREFIX.length));
    } catch {
        return null;
    }
    if (!isRecord(raw)) return null;
    const files = Array.isArray(attachments) ? attachments : [];
    // A picture uploaded with the message is named "att:<file name>"
    for (const key of ["avatar", "banner"] as const) {
        const ref = raw[key];
        if (typeof ref === "string" && ref.startsWith("att:")) raw[key] = files.find(file => file?.filename === ref.slice(4))?.url;
    }
    return sanitizeShared(raw) ?? {};
}

/** The message that takes a shared profile back: an empty profile, read as one by every Endcord client */
export const EMPTY_PROFILE_MESSAGE = `${PREFIX}{}`;

/** Whether a profile has nothing in it to show */
export const isEmptyProfile = (data: CustomProfileData | null | undefined) => !data || Object.keys(data).length === 0;

/** A picture picked on this phone, to upload with the profile message */
export interface SharedPicture {
    key: "avatar" | "banner";
    filename: string;
    mime: string;
    base64: string;
}

/** A data: link's picture, when it's one Discord takes as an attachment */
export function pictureOf(url: string, key: SharedPicture["key"]): SharedPicture | null {
    const match = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(url);
    if (!match) return null;
    return { key, filename: `${key}.${match[2] === "jpeg" ? "jpg" : match[2]}`, mime: match[1], base64: match[3] };
}

/**
 * The message that shares a profile: what others may see of it, as compact JSON. Pictures picked on this phone go along
 * as attachments and the text names them. Too long, the bio is shortened, then left out
 */
export function writeProfileMessage(data: CustomProfileData) {
    const shared: Record<string, unknown> = {};
    // Only the fields others may see, in the order they were saved in, like Endcord PC's copy without the private ones.
    // And only as a reader would take them: what's saved here can come from a restored backup, which is someone's file
    const checked = (sanitizeShared({ ...data, avatar: undefined, banner: undefined }) ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(data)) {
        if (!(SHARED_KEYS as readonly string[]).includes(key) || (PRIVATE_KEYS as readonly string[]).includes(key)) continue;
        if (key === "avatar" || key === "banner") shared[key] = (data as Record<string, unknown>)[key];
        else if (checked[key] !== undefined) shared[key] = checked[key];
    }

    const pictures: SharedPicture[] = [];
    for (const key of ["avatar", "banner"] as const) {
        const value = data[key];
        if (typeof value !== "string" || !value) {
            delete shared[key];
            continue;
        }
        if (value.startsWith("data:")) {
            const picture = pictureOf(value, key);
            if (picture) {
                pictures.push(picture);
                shared[key] = `att:${picture.filename}`;
                continue;
            }
        }
        // Only pictures on Discord's servers can be shown to others; anything else stays on this phone
        if (!DISCORD_CDN.test(value) || value.length > MAX_PICTURE_LINK) delete shared[key];
    }

    let content = PREFIX + JSON.stringify(shared);
    if (content.length > MAX_CONTENT && typeof shared.bio === "string") {
        shared.bio = shared.bio.slice(0, Math.max(0, shared.bio.length - (content.length - MAX_CONTENT) - 1));
        content = PREFIX + JSON.stringify(shared);
    }
    if (content.length > MAX_CONTENT) {
        delete shared.bio;
        content = PREFIX + JSON.stringify(shared);
    }
    return { content, pictures, fits: content.length <= MAX_CONTENT };
}

/** The same message without the pictures that couldn't be uploaded, which then stay on this phone */
export function withoutPictures(content: string, keys: SharedPicture["key"][]) {
    if (!keys.length || !content.startsWith(PREFIX)) return content;
    const shared = JSON.parse(content.slice(PREFIX.length));
    for (const key of keys) delete shared[key];
    return PREFIX + JSON.stringify(shared);
}

/** Short, and the same for the same profile: what was shared, without keeping a copy of it. As on Endcord PC */
export function fingerprint(data: CustomProfileData | null) {
    const text = data ? `${writeProfileMessage(data).content + (data.avatar?.length ?? 0)}:${data.banner?.length ?? 0}` : "";
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `${(hash >>> 0).toString(36)}.${text.length}`;
}

/** Whether snowflake a is newer than b */
export const newer = (a: string, b: string) => a.length !== b.length ? a.length > b.length : a > b;

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_INDEX = new Map([...BASE64].map((c, i) => [c, i]));

/** The bytes of base64 text, or null when it isn't base64 */
export function base64ToBytes(b64: string): Uint8Array | null {
    const clean = b64.replace(/\s+/g, "");
    if (clean.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
    const body = clean.replace(/=+$/, "");
    const out = new Uint8Array(Math.floor(body.length * 3 / 4));
    let buffer = 0, bits = 0, n = 0;
    for (const char of body) {
        // Only the bits not yet written out are kept
        buffer = ((buffer << 6) | BASE64_INDEX.get(char)!) & 0xffffff;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[n++] = (buffer >> bits) & 0xff;
        }
    }
    return n === out.length ? out : out.slice(0, n);
}
