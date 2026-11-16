/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Profiles shared between Endcord users, like Endcord PC's, with Discord itself as the place they're kept. Saving a
 * profile posts one message to the profiles channel in the Endcord server, and every Endcord user in that server reads
 * the channel, on a PC or a phone. Discord vouches for who wrote each message, so nobody can publish a profile for
 * someone else; nothing goes to a server of Endcord's.
 */

import { createMMKVBackend, type StorageBackend } from "@core/vendetta/storage";

import { getStore, subscribe } from "../common";
import { HTTP } from "../hooks";
import type { CustomProfileData } from "./data";
import {
    base64ToBytes, EMPTY_PROFILE_MESSAGE, fingerprint, isEmptyProfile, newer, readProfileMessage, sanitizeShared, type SharedPicture,
    SNOWFLAKE, withoutPictures, writeProfileMessage
} from "./sharingFormat";

export const PROFILES_GUILD_ID = "1543323763695820942";
/** The profiles channel in the Endcord server, the same one Endcord PC reads and writes */
export const PROFILES_CHANNEL_ID = "1568188531480993842";
export const PROFILES_INVITE_CODE = "endcord";
export const PROFILES_INVITE = `https://discord.gg/${PROFILES_INVITE_CODE}`;

/** Read the whole channel again this often, which also drops profiles whose messages were deleted */
const FULL_SYNC_EVERY = 12 * 60 * 60 * 1000;
/** Pick up new profiles this often, in case Discord said nothing about the channel */
const SYNC_EVERY = 10 * 60 * 1000;
/**
 * When Discord only says the channel has a newer message, each client reads it after a random moment up to this long,
 * so the Endcord users online don't all ask Discord in the same second
 */
const PASSIVE_SPREAD = 3000;
/** Between pages of the channel, to stay well inside Discord's limits */
const PAGE_DELAY = 500;
/** One read never goes through more pages than this, whatever the channel answers */
const MAX_PAGES = 1000;
/** An upload that takes longer than this is given up on; the rest of the profile is shared without the picture */
const UPLOAD_TIMEOUT = 60_000;
/** Quiet and plain: no notification, no link previews */
const MESSAGE_FLAGS = (1 << 2) | (1 << 12);

const MESSAGES_URL = `/channels/${PROFILES_CHANNEL_ID}/messages`;

interface SharedEntry {
    /** The message it came from; a newer message from the same person replaces it */
    m: string;
    d: CustomProfileData;
}

interface SharedCache {
    channel: string;
    /** The newest message read, where the next sync starts */
    newest: string | null;
    fullAt: number;
    profiles: Record<string, SharedEntry>;
}

/**
 * Per account: what it last shared from this phone (f), the message that holds it (m), and its older messages that
 * couldn't be deleted when it was shared or taken back (o), deleted once they can be
 */
interface Published {
    accounts: Record<string, { f: string; m?: string; o?: string[]; }>;
    /** Whether this phone said once that the profile is only seen here until the server is joined */
    notMemberWarned?: boolean;
    /** The accounts asked once whether to share a profile saved before profiles were shared */
    offered: string[];
}

interface Logger {
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}

const emptyCache = (): SharedCache => ({ channel: PROFILES_CHANNEL_ID, newest: null, fullAt: 0, profiles: {} });

let cache: SharedCache = emptyCache();
let onChange: (changed: string[]) => void = () => { };
let logger: Logger = console;
/** Changes whenever sharing stops, so what a stopped run was waiting for doesn't act afterwards */
let generation = 0;
const unsubscribes: Array<() => void> = [];
let syncTimer: ReturnType<typeof setInterval> | undefined;
let firstSyncTimer: ReturnType<typeof setTimeout> | undefined;
let syncing: Promise<void> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
/** When a save that slow mode turned away goes out, or 0 */
let retryAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let passiveTimer: ReturnType<typeof setTimeout> | undefined;
/** The newest message id a read was already started for, so the same one never starts another */
let askedFor: string | null = null;
/** The signed-in account and its profile, or null without one */
let getMine: () => { id: string; data: CustomProfileData | null; } | null = () => null;
/** Asks whether to share a profile saved before profiles were shared */
let offer: ((myId: string) => void) | undefined;

// ---- Storage -------------------------------------------------------------------------------------------------------

let cacheBackend: StorageBackend | undefined;
let publishedBackend: StorageBackend | undefined;
const cacheStore = () => cacheBackend ??= createMMKVBackend("ENDCORD_CUSTOM_PROFILE_SHARED", {});
const publishedStore = () => publishedBackend ??= createMMKVBackend("ENDCORD_CUSTOM_PROFILE_PUBLISHED", { accounts: {} });

// One write at a time, each with what's current when it runs
let cacheWrite: Promise<unknown> = Promise.resolve();
let cacheWriteTimer: ReturnType<typeof setTimeout> | undefined;
/** How long a write waits for others: profiles that come in one by one are written together */
const CACHE_WRITE_DELAY = 5000;

function saveCache() {
    clearTimeout(cacheWriteTimer);
    cacheWriteTimer = undefined;
    // What's there now: stopping takes the profiles out of memory right after asking for this write
    const snapshot = cache;
    cacheWrite = cacheWrite
        .then(() => cacheStore().set(snapshot))
        .catch(err => logger.warn("Couldn't keep the shared profiles", err));
    return cacheWrite;
}

/** The whole cache is one file, of every shared profile: written once for the profiles that come in close together */
function saveCacheSoon() {
    cacheWriteTimer ??= setTimeout(saveCache, CACHE_WRITE_DELAY);
}

/** Read from its file once; from then on this copy is what's current, and every change is written from it */
let published: Promise<Published> | undefined;
let publishedWrite: Promise<unknown> = Promise.resolve();

function parsePublished(raw: any): Published {
    const accounts: Published["accounts"] = {};
    // The file is anyone's to edit: only ids and strings of the right shape come out of it
    if (raw?.accounts && typeof raw.accounts === "object") {
        for (const [id, entry] of Object.entries<any>(raw.accounts)) {
            if (!SNOWFLAKE.test(id) || typeof entry?.f !== "string") continue;
            const left = Array.isArray(entry.o) ? [...new Set(entry.o.filter(isMessageId) as string[])].slice(-10) : [];
            accounts[id] = { f: entry.f, m: isMessageId(entry.m) ? entry.m : undefined, ...left.length ? { o: left } : {} };
        }
    }
    const offered = Array.isArray(raw?.offered) ? raw.offered.filter((id: unknown) => typeof id === "string" && SNOWFLAKE.test(id)).slice(-50) : [];
    return { accounts, notMemberWarned: raw?.notMemberWarned === true, offered };
}

const readPublished = () => published ??= Promise.resolve()
    .then(() => publishedStore().get())
    .then(parsePublished, () => parsePublished(null));

async function writePublished(change: (published: Published) => void) {
    const current = await readPublished();
    change(current);
    publishedWrite = publishedWrite
        .then(() => publishedStore().set(current))
        .catch(err => logger.warn("Couldn't remember the shared profile", err));
    await publishedWrite;
}

// ---- What others shared ----------------------------------------------------------------------------------------------

export const isInProfilesServer = () => !!getStore("GuildStore")?.getGuild?.(PROFILES_GUILD_ID);

/**
 * Whether the account a message would be sent from is this one. Discord's requests go out as whoever is signed in when
 * they're sent: after a switch, a retry or an upload still under way would post one account's profile as another's
 */
const signedInAs = (userId: string) => getStore("AuthenticationStore")?.getId?.() === userId;

const entryOf = (target: SharedCache, userId: string) => Object.prototype.hasOwnProperty.call(target.profiles, userId) ? target.profiles[userId] : undefined;

/** Another Endcord user's shared profile, or null: also when they emptied it */
export const getSharedProfile = (userId: string | null | undefined) => {
    const data = userId ? entryOf(cache, userId)?.d : undefined;
    return data && !isEmptyProfile(data) ? data : null;
};
export const hasSharedProfiles = () => Object.keys(cache.profiles).length > 0;
export const sharedProfileIds = () => Object.keys(cache.profiles);
/** When a save that the channel's slow mode turned away is sent again, or 0 */
export const sharingRetryAt = () => retryAt;

/** The authors whose messages came in live while the whole channel was being read again */
let takenLive: Set<string> | null = null;
/** The messages deleted meanwhile */
let droppedLive: Set<string> | null = null;

const DISCORD_EPOCH = 1420070400000;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether an id is one Discord could have given a message by now. Ids hold the time they were made; one from the
 * future, or longer than ids are, would count as newer than every real message and keep its profile in place for good
 */
export const isMessageId = (id: unknown, now = Date.now()): id is string =>
    typeof id === "string" && /^[1-9]\d{14,19}$/.test(id) && Number(id) / 4194304 + DISCORD_EPOCH <= now + DAY;

/**
 * Takes a message into a cache, if it's newer than what its author had, or that very message, edited. Returns whether
 * anything changed
 */
function takeMessage(message: any, target = cache): boolean {
    const author = message?.author?.id;
    const id = message?.id;
    if (typeof author !== "string" || !SNOWFLAKE.test(author) || !isMessageId(id) || typeof message.content !== "string") return false;
    if (target.newest == null || newer(id, target.newest)) target.newest = id;

    const current = entryOf(target, author);
    if (current && current.m !== id && !newer(id, current.m)) return false;
    const data = readProfileMessage(message.content, Array.isArray(message.attachments) ? message.attachments : []);
    if (!data) {
        // The message that held their profile was edited into something that isn't one: the profile goes with it
        if (current?.m !== id) return false;
        delete target.profiles[author];
        return true;
    }
    if (current?.m === id && JSON.stringify(current.d) === JSON.stringify(data)) return false;
    target.profiles[author] = { m: id, d: data };
    return true;
}

function dropMessage(messageId: string) {
    for (const [author, entry] of Object.entries(cache.profiles)) {
        if (entry.m === messageId) {
            delete cache.profiles[author];
            return author;
        }
    }
    return null;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isEmptyRecord = (value: unknown) => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;

function http() {
    const module = HTTP();
    if (typeof module?.get !== "function") throw new Error("Discord's HTTP module wasn't found");
    return module;
}

async function fetchPage(query: Record<string, string>) {
    const params = Object.entries({ limit: "100", ...query }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    const res = await http().get({ url: `${MESSAGES_URL}?${params}`, retries: 2, oldFormErrors: true });
    return Array.isArray(res?.body) ? res.body : [];
}

/** Reads what's new in the channel, or all of it when it's been a while, so deleted profiles drop out too */
async function sync() {
    if (!isInProfilesServer()) return;
    const run = generation;
    const full = !cache.newest || Date.now() - cache.fullAt > FULL_SYNC_EVERY || cache.channel !== PROFILES_CHANNEL_ID;
    const before = new Map(Object.entries(cache.profiles).map(([id, entry]) => [id, entry.m]));

    if (full) {
        // Read into a cache of its own, so the profiles already known stay on screen until it's done
        const fresh: SharedCache = { ...emptyCache(), fullAt: Date.now() };
        const live = takenLive = new Set<string>();
        const dropped = droppedLive = new Set<string>();
        try {
            let oldest: string | undefined;
            for (let pages = 0; pages < MAX_PAGES; pages++) {
                const page = await fetchPage(oldest ? { before: oldest } : {});
                if (run !== generation) return;
                for (const message of page) takeMessage(message, fresh);
                const last = page[page.length - 1]?.id;
                if (page.length < 100 || typeof last !== "string" || last === oldest) break;
                oldest = last;
                await sleep(PAGE_DELAY);
            }
            // What came in live meanwhile can be newer than the page it would have been on
            for (const [author, entry] of Object.entries(fresh.profiles)) {
                if (dropped.has(entry.m)) delete fresh.profiles[author];
            }
            for (const author of live) {
                const live = entryOf(cache, author), read = entryOf(fresh, author);
                if (live && (!read || newer(live.m, read.m))) fresh.profiles[author] = live;
            }
            if (cache.newest && (!fresh.newest || newer(cache.newest, fresh.newest))) fresh.newest = cache.newest;
            cache = fresh;
        } finally {
            // Unless a read started after this one was stopped has its own by now
            if (takenLive === live) takenLive = null;
            if (droppedLive === dropped) droppedLive = null;
        }
    } else {
        let after = cache.newest!;
        for (let pages = 0; pages < MAX_PAGES; pages++) {
            const page = await fetchPage({ after });
            if (run !== generation) return;
            for (const message of page) takeMessage(message);
            if (page.length < 100) break;
            const next = page.reduce((max: string, message: any) => typeof message?.id === "string" && SNOWFLAKE.test(message.id) && newer(message.id, max) ? message.id : max, after);
            if (next === after) break;
            after = next;
            await sleep(PAGE_DELAY);
        }
    }
    if (run !== generation) return;

    const changed = [...new Set([...before.keys(), ...Object.keys(cache.profiles)])].filter(id => before.get(id) !== cache.profiles[id]?.m);
    if (changed.length) {
        onChange(changed);
        await saveCache();
    }
}

function syncSoon() {
    if (syncing) return syncing;
    const current: Promise<void> = sync()
        .catch(err => logger.warn("Couldn't read shared profiles", err))
        .finally(() => {
            if (syncing === current) syncing = undefined;
        });
    return syncing = current;
}

// Discord sends the channel's messages live to members, so new and changed profiles show without waiting for a sync
function onMessageCreate({ message, channelId }: any) {
    if ((channelId ?? message?.channel_id) !== PROFILES_CHANNEL_ID) return;
    if (takeMessage(message)) {
        takenLive?.add(message.author.id);
        onChange([message.author.id]);
        saveCacheSoon();
    }
}

function onMessageDelete({ id, channelId }: any) {
    if (channelId !== PROFILES_CHANNEL_ID || typeof id !== "string") return;
    droppedLive?.add(id);
    const author = dropMessage(id);
    if (author) {
        onChange([author]);
        saveCacheSoon();
    }
}

// Several at once, as when a moderator removes someone's messages or bans them with their messages
function onMessageDeleteBulk({ ids, channelId }: any) {
    if (channelId !== PROFILES_CHANNEL_ID || !Array.isArray(ids)) return;
    const authors: string[] = [];
    for (const id of ids) {
        if (typeof id !== "string") continue;
        droppedLive?.add(id);
        const author = dropMessage(id);
        if (author) authors.push(author);
    }
    if (authors.length) {
        onChange(authors);
        saveCacheSoon();
    }
}

/** The channel's newest message id, as far as Discord has told this client, or null */
function latestKnown(event?: any): string | null {
    const ids: unknown[] = [];
    try {
        ids.push(getStore("ReadStateStore")?.lastMessageId?.(PROFILES_CHANNEL_ID));
    } catch { }
    for (const channel of Array.isArray(event?.channels) ? event.channels : []) {
        if (channel?.id === PROFILES_CHANNEL_ID) ids.push(channel.lastMessageId ?? channel.last_message_id);
    }
    return (ids.filter(id => typeof id === "string" && SNOWFLAKE.test(id)) as string[])
        .reduce<string | null>((max, id) => !max || newer(id, max) ? id : max, null);
}

/**
 * In a big server Discord doesn't send every member every message, only each channel's newest message id now and then.
 * A newer one here means someone shared a profile, and reading what's new picks it up. Once per id: when the newest
 * message was deleted, the id stays behind, and it mustn't start a read every time Discord repeats it
 */
function onPassiveUpdate(event?: any) {
    const latest = latestKnown(event);
    if (!latest || latest === askedFor || (cache.newest && !newer(latest, cache.newest)) || passiveTimer) return;
    askedFor = latest;
    passiveTimer = setTimeout(() => {
        passiveTimer = undefined;
        syncSoon();
    }, 300 + Math.random() * PASSIVE_SPREAD);
}

/** When sharing started or Discord last connected: the servers that arrive just after are part of connecting */
let connectedAt = 0;

/** The Endcord server, joined just now: what was waiting is read and shared without waiting for the next sync */
function onGuildCreate(event: any, read: boolean) {
    if ((event?.guild?.id ?? event?.guildId) !== PROFILES_GUILD_ID) return;
    // Part of starting or connecting again, which the timers set then cover, without adding to all Discord does then
    if (Date.now() - connectedAt < 20_000) return;
    sharePendingSoon(3000);
    if (!read) return;
    const run = generation;
    clearTimeout(firstSyncTimer);
    // A moment, for Discord to take in the server's channels
    firstSyncTimer = setTimeout(() => {
        if (run === generation) syncSoon();
    }, 2000);
}

/**
 * Loads the cached profiles, and with read, keeps them up to date from the channel. Once Discord is connected, the
 * signed-in account's profile is shared if it changed since it last was: saved before joining the server, saved on
 * another account, or saved while sharing failed
 */
export async function startSharing(changed: (userIds: string[]) => void, options: { read: boolean; mine: typeof getMine; offer?: (myId: string) => void; logger?: Logger; }) {
    stopSharing();
    const run = ++generation;
    onChange = changed;
    ({ mine: getMine, offer } = options);
    if (options.logger) ({ logger } = options);
    connectedAt = Date.now();
    unsubscribes.push(
        subscribe("CONNECTION_OPEN", () => {
            connectedAt = Date.now();
            sharePendingSoon();
        }),
        subscribe("GUILD_CREATE", (event: any) => onGuildCreate(event, options.read)),
    );
    sharePendingSoon();

    const saved = await Promise.resolve().then(() => cacheStore().get()).catch(() => null) as SharedCache | null;
    if (run !== generation) return;
    if (saved?.profiles && typeof saved.profiles === "object" && saved.channel === PROFILES_CHANNEL_ID) {
        // What was cached was checked when it came in, but it's checked again: the cache is a file anyone can edit
        const loaded: SharedCache = {
            channel: PROFILES_CHANNEL_ID,
            newest: isMessageId(saved.newest) ? saved.newest : null,
            // A time that hasn't come yet would put off reading the whole channel again, which is what drops the
            // profiles that were removed, for as long as it likes
            fullAt: typeof saved.fullAt === "number" && saved.fullAt > 0 && saved.fullAt <= Date.now() ? saved.fullAt : 0,
            profiles: {},
        };
        for (const [id, entry] of Object.entries<any>(saved.profiles)) {
            // An emptied profile is kept as one, so an older message of the same person read later doesn't come back
            const data = isEmptyRecord(entry?.d) ? {} : sanitizeShared(entry?.d);
            if (data && SNOWFLAKE.test(id) && isMessageId(entry.m)) loaded.profiles[id] = { m: entry.m, d: data };
        }
        // Whatever arrived live while the cache was loading is newer than the cache
        for (const [id, entry] of Object.entries(cache.profiles)) loaded.profiles[id] = entry;
        if (cache.newest && (!loaded.newest || newer(cache.newest, loaded.newest))) loaded.newest = cache.newest;
        cache = loaded;
        if (hasSharedProfiles()) onChange(sharedProfileIds());
    }
    if (!options.read) return;

    unsubscribes.push(
        subscribe("MESSAGE_CREATE", onMessageCreate),
        subscribe("MESSAGE_UPDATE", onMessageCreate),
        subscribe("MESSAGE_DELETE", onMessageDelete),
        subscribe("MESSAGE_DELETE_BULK", onMessageDeleteBulk),
        subscribe("PASSIVE_UPDATE_V2", onPassiveUpdate),
    );
    syncTimer = setInterval(syncSoon, SYNC_EVERY);
    // Not at once: Discord has enough to do right after it starts
    firstSyncTimer = setTimeout(syncSoon, 15_000);
}

export function stopSharing() {
    if (cacheWriteTimer) saveCache();
    generation++;
    for (const unsubscribe of unsubscribes.splice(0)) {
        try {
            unsubscribe();
        } catch { }
    }
    clearTimeout(pendingTimer);
    clearInterval(syncTimer);
    clearTimeout(firstSyncTimer);
    clearTimeout(passiveTimer);
    clearTimeout(retryTimer);
    pendingTimer = syncTimer = firstSyncTimer = passiveTimer = retryTimer = undefined;
    syncing = undefined;
    takenLive = droppedLive = null;
    askedFor = null;
    retryAt = 0;
    getMine = () => null;
    offer = undefined;
    const ids = sharedProfileIds();
    cache = { ...cache, profiles: {} };
    if (ids.length) onChange(ids);
}

// ---- Publishing ----------------------------------------------------------------------------------------------------

/** Puts bytes at an upload link Discord gave, the same way its own app sends a file */
function put(url: string, mime: string, bytes: Uint8Array) {
    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        // React Native's networking on Android refuses a body without one
        xhr.setRequestHeader("Content-Type", mime);
        xhr.timeout = UPLOAD_TIMEOUT;
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`The upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("The upload failed"));
        xhr.ontimeout = () => reject(new Error("The upload took too long"));
        xhr.send(bytes);
    });
}

/** Uploads a picture picked on this phone to the profiles channel, for the message that names it */
async function upload(picture: SharedPicture) {
    const bytes = base64ToBytes(picture.base64);
    if (!bytes?.length) throw new Error(`${picture.filename} isn't a picture`);
    const res = await http().post({
        url: `/channels/${PROFILES_CHANNEL_ID}/attachments`,
        body: { files: [{ id: "0", filename: picture.filename, file_size: bytes.length, is_clip: false }] },
        oldFormErrors: true,
    });
    const slot = res?.body?.attachments?.[0];
    // Only to where Discord said, and only over https
    if (typeof slot?.upload_url !== "string" || !/^https:\/\/[^\s/]+\//i.test(slot.upload_url) || typeof slot.upload_filename !== "string") {
        throw new Error(`Discord didn't say where to upload ${picture.filename}`);
    }
    await put(slot.upload_url, picture.mime, bytes);
    return { filename: picture.filename, uploaded_filename: slot.upload_filename as string };
}

/** The server list arrives a moment after Discord connects */
function sharePendingSoon(delay = 20_000) {
    clearTimeout(pendingTimer);
    const run = generation;
    pendingTimer = setTimeout(() => {
        if (run === generation) sharePending().catch(err => logger.warn("Couldn't share the profile", err));
    }, delay);
}

async function sharePending() {
    const run = generation;
    const mine = getMine();
    const ask = offer;
    if (!mine || !isInProfilesServer()) return;
    const published = await readPublished();
    // Not once sharing stopped meanwhile (the plugin turned off)
    if (run !== generation) return;
    if (published.accounts[mine.id] === undefined) {
        // Saved before profiles were shared, when the editor said only you see it: never shared without asking, and
        // asked once. Saving it again shares it, as the editor says now
        if (mine.data && ask && !published.offered.includes(mine.id)) {
            await writePublished(p => void p.offered.push(mine.id));
            // Nor for an account that's no longer the one signed in
            if (run === generation && getMine()?.id === mine.id) ask(mine.id);
        }
        return;
    }
    if (published.accounts[mine.id].f !== fingerprint(mine.data)) await publishProfile(mine.id, mine.data);
    else if (published.accounts[mine.id].o?.length) await deleteLeftovers(mine.id);
}

/**
 * Deletes this account's own messages in the channel, while it's the one signed in. Returns the ones still there: one
 * that's gone already is what deleting it was for
 */
async function deleteMessages(myId: string, ids: string[]) {
    const left: string[] = [];
    for (const id of ids) {
        if (!signedInAs(myId)) {
            left.push(id);
            continue;
        }
        try {
            await http().del({ url: `${MESSAGES_URL}/${id}`, oldFormErrors: true });
        } catch (err: any) {
            if (err?.status !== 404) left.push(id);
        }
    }
    return left;
}

/** The older messages a share or a take-back couldn't delete then (offline, rate limited) */
async function deleteLeftovers(myId: string) {
    const ids = (await readPublished()).accounts[myId]?.o ?? [];
    const left = new Set(await deleteMessages(myId, ids));
    // Only the ones tried here: a share meanwhile may have left others
    await writePublished(p => {
        const entry = p.accounts[myId];
        if (!entry?.o) return;
        const still = entry.o.filter(id => !ids.includes(id) || left.has(id));
        if (still.length) entry.o = still;
        else delete entry.o;
    });
}

export type PublishResult = "published" | "published-without-pictures" | "not-member" | "too-long" | "later" | "failed";

/** Whether this phone already said the profile is only seen here until the server is joined; says so from now on */
export async function takeNotMemberWarning() {
    const published = await readPublished();
    if (published.notMemberWarned) return false;
    await writePublished(p => void (p.notMemberWarned = true));
    return true;
}

/**
 * Shares this account's profile: posts the new message, then deletes the ones it replaces. With null, the profile is
 * taken back. The channel's slow mode can turn a quick second save away; the newest one is sent again once it may be
 * (sharingRetryAt says when)
 */
export async function publishProfile(myId: string, data: CustomProfileData | null): Promise<PublishResult> {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    retryAt = 0;
    if (!SNOWFLAKE.test(myId) || !signedInAs(myId)) return "failed";
    // Saved since profiles are shared: if it can't be shared now, it is once it can (sharePending)
    if ((await readPublished()).accounts[myId] === undefined) await writePublished(p => void (p.accounts[myId] ??= { f: "" }));
    if (!isInProfilesServer()) return "not-member";
    const run = generation;

    // The message the channel shows for this account, and the one this phone last posted, when that's another: posted
    // while the channel wasn't being read, or before a newer one from another device. And the older ones that couldn't
    // be deleted before
    const record = (await readPublished()).accounts[myId];
    const previous = new Set([entryOf(cache, myId)?.m, record?.m, ...record?.o ?? []].filter((id): id is string => isMessageId(id)));
    // Shared from this phone before: taking it back says so in the channel even when its message isn't known here
    const wasShared = !!record?.f && record.f !== fingerprint(null);
    let posted: string | undefined;
    let withoutSomePictures = false;
    try {
        if (data) {
            const { content, pictures, fits } = writeProfileMessage(data);
            if (!fits) return "too-long";
            const attachments: Array<{ id: string; filename: string; uploaded_filename: string; }> = [];
            const failed: SharedPicture["key"][] = [];
            for (const picture of pictures) {
                try {
                    attachments.push({ id: String(attachments.length), ...await upload(picture) });
                } catch (err) {
                    // The rest of the profile is still shared; the picture stays on this phone
                    logger.warn(`Couldn't upload the ${picture.key} to share it`, err);
                    failed.push(picture.key);
                }
            }
            withoutSomePictures = failed.length > 0;
            // Uploads can take a while; the account may have changed meanwhile
            if (!signedInAs(myId)) return "failed";
            const res = await http().post({
                url: MESSAGES_URL,
                body: {
                    content: withoutPictures(content, failed),
                    flags: MESSAGE_FLAGS,
                    allowed_mentions: { parse: [] },
                    attachments,
                },
                oldFormErrors: true,
            });
            const message = res?.body;
            if (message?.id) {
                posted = String(message.id);
                takeMessage({ ...message, author: { id: typeof message.author?.id === "string" ? message.author.id : myId } });
            }
        } else if (Object.prototype.hasOwnProperty.call(cache.profiles, myId)) {
            delete cache.profiles[myId];
        }
        // The messages it replaces: the ones that can't be deleted now are kept, and deleted later (deleteLeftovers)
        const left = await deleteMessages(myId, [...previous].filter(id => id !== posted));
        if (!data && (previous.size || wasShared) && signedInAs(myId)) {
            // In a big server Discord doesn't tell everyone a message was deleted, only that the channel has a new one:
            // an empty profile after the deletions takes it back on those phones within moments, not at the next full
            // read. With every deletion through, it's done already, and the channel's slow mode (a save a moment
            // before) may turn this away. Otherwise it's what takes the profile back: without it, it's tried again
            try {
                const res = await http().post({
                    url: MESSAGES_URL,
                    body: { content: EMPTY_PROFILE_MESSAGE, flags: MESSAGE_FLAGS, allowed_mentions: { parse: [] }, attachments: [] },
                    oldFormErrors: true,
                });
                const message = res?.body;
                if (message?.id && isMessageId(String(message.id))) {
                    posted = String(message.id);
                    takeMessage({ ...message, id: posted, author: { id: myId } });
                }
            } catch (err) {
                if (left.length) throw err;
            }
        }
        if (run === generation) {
            onChange([myId]);
            saveCacheSoon();
        }
        if (!data && left.length && !posted) {
            // Still shown to everyone: what this phone last shared stays as it was, so it's taken back again the next
            // time Discord connects (sharePending), or at the next save
            logger.warn("Couldn't take the shared profile back yet");
            return "failed";
        }
        await writePublished(p => void (p.accounts[myId] = { f: fingerprint(data), m: posted, ...left.length ? { o: left } : {} }));
        return withoutSomePictures ? "published-without-pictures" : "published";
    } catch (err: any) {
        const wait = Number(err?.body?.retry_after);
        if (err?.status === 429 && Number.isFinite(wait)) {
            const delay = (Math.max(0, wait) + 2) * 1000;
            retryAt = Date.now() + delay;
            retryTimer = setTimeout(() => {
                // Not for an account that's no longer the one signed in: it's shared when it is again (sharePending)
                if (run === generation && signedInAs(myId)) publishProfile(myId, data).catch(e => logger.warn("Couldn't share the profile", e));
            }, delay);
            return "later";
        }
        logger.error("Couldn't share the profile", err);
        return "failed";
    }
}
