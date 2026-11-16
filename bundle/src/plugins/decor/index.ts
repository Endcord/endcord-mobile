/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's Decor: the custom avatar decorations people picked with Decor (decor.fieryflames.dev), shown on their
 * avatars. Picking or making one needs Decor's sign-in and upload screens, which are PC's; here you see everyone's.
 *
 * Discord draws a decoration from the user record's avatarDecoration, through getAvatarDecorationURL, as CustomProfile
 * relies on: someone with a Decor decoration gets a copy of their record carrying it, whose image comes from Decor's
 * CDN. Who has one is asked for the people you actually see (chat authors, member lists, profiles), a hundred at a time,
 * and remembered for four hours, across restarts too, so the same people aren't asked about again.
 */

import { tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { after, instead } from "@lib/api/patcher";
import safeFetch, { readJson } from "@lib/utils/safeFetch";
import { findByProps, findByTypeNameAll } from "@metro";

import { definePlugin } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { onMessageRow } from "../hooks";
import { redrawProfiles } from "../shared/profiles";
import { BATCH_SIZE, decorationUrl, FETCH_COOLDOWN, isFresh, isUserId, type Known, prune, readAnswer, SKU_ID, usersUrl } from "./data";

const kept = wrapSync(createStorage<{ users?: Record<string, Known>; }>(createMMKVBackend("ENDCORD_DECOR_CACHE", { users: {} })));

/** Waits this long after the first person is seen, so the people seen together go in one request */
const BATCH_DELAY = 1500;
/** A failed request is tried again this much later, so an outage isn't asked every time */
const RETRY_AFTER = 5 * 60 * 1000;
/** The most an answer may weigh: a hundred short hashes */
const MAX_ANSWER_BYTES = 256 * 1024;

/** A copy of a user record that carries a decoration, on the same prototype, so Discord treats it as the record */
function withDecoration(user: any, asset: string) {
    const clone = Object.create(Object.getPrototypeOf(user));
    for (const key of Reflect.ownKeys(user)) {
        const desc = Object.getOwnPropertyDescriptor(user, key);
        if (desc) Object.defineProperty(clone, key, { ...desc, configurable: true });
    }
    const decoration = { asset, skuId: SKU_ID };
    // Discord reads both names, depending on the screen
    for (const key of ["avatarDecoration", "avatarDecorationData"]) Object.defineProperty(clone, key, { value: decoration, writable: true, configurable: true, enumerable: true });
    return clone;
}

export default definePlugin({
    id: "endcord.decor",
    name: "Decor",
    description: tx("Shows the custom avatar decorations people picked with Decor on Endcord PC and other clients"),
    icon: "SparklesIcon",
    tags: ["Appearance", "Customisation"],
    async start({ cleanup, logger }) {
        const users = getStore("UserStore");
        const images = findByProps("getAvatarDecorationURL");
        if (typeof users?.getUser !== "function" || typeof images?.getAvatarDecorationURL !== "function") throw new Error("Discord's avatar decorations weren't found");
        await awaitStorage(kept);

        // Plain copies of what was kept, checked again: getUser runs very often, and the storage's own objects report
        // every read
        const known = new Map<string, Known>(Object.entries(prune(Object.entries(kept.users ?? {}))));
        const queue = new Set<string>();
        /** Those being asked about now, who aren't asked about again while the answer comes */
        const asking = new Set<string>();
        const copies = new WeakMap<object, { asset: string; copy: any; }>();
        const requests = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let fetching = false;
        let stopped = false;

        const save = () => {
            kept.users = prune(known);
        };

        /** Asks about someone seen, unless what's known about them is recent */
        const see = (id: unknown, force = false) => {
            if (stopped || !isUserId(id) || queue.has(id) || asking.has(id)) return;
            if (!force && isFresh(known.get(id), Date.now())) return;
            queue.add(id);
            timer ??= setTimeout(flush, BATCH_DELAY);
        };

        const flush = async () => {
            timer = undefined;
            if (fetching || stopped || !queue.size) return;
            const ids = [...queue].slice(0, BATCH_SIZE);
            for (const id of ids) {
                queue.delete(id);
                asking.add(id);
            }
            fetching = true;
            const controller = new AbortController();
            const abort = () => controller.abort();
            requests.signal.addEventListener?.("abort", abort);
            const timeout = setTimeout(abort, 20_000);
            try {
                const res = await safeFetch(usersUrl(ids), { signal: controller.signal });
                const found = readAnswer(await readJson(res, MAX_ANSWER_BYTES), ids);
                if (stopped) return;
                const now = Date.now();
                let changed = false;
                for (const [id, asset] of found) {
                    if ((known.get(id)?.a ?? null) !== asset) changed = true;
                    known.set(id, { a: asset, t: now });
                }
                save();
                if (changed) redrawProfiles();
            } catch (e) {
                if (stopped) return;
                logger.warn("Couldn't ask Decor about decorations", e);
                const retry = Date.now() - FETCH_COOLDOWN + RETRY_AFTER;
                for (const id of ids) known.set(id, { a: known.get(id)?.a ?? null, t: retry });
            } finally {
                clearTimeout(timeout);
                requests.signal.removeEventListener?.("abort", abort);
                for (const id of ids) asking.delete(id);
                fetching = false;
                // People seen meanwhile go in the next request
                if (!stopped && queue.size) timer ??= setTimeout(flush, BATCH_DELAY);
            }
        };

        let shown = false;
        /** The record to give Discord: a copy with the decoration for someone who has one */
        const decorate = (user: any) => {
            if (!user || typeof user !== "object") return user;
            const asset = known.get(user.id)?.a;
            if (!asset) return user;
            const cached = copies.get(user);
            if (cached?.asset === asset) return cached.copy;
            try {
                const copy = withDecoration(user, asset);
                copies.set(user, { asset, copy });
                shown = true;
                return copy;
            } catch {
                return user;
            }
        };

        cleanup(
            // Last, once nothing is patched: what showed a decoration draws again without it
            () => shown && redrawProfiles(),
            () => {
                stopped = true;
                clearTimeout(timer);
                requests.abort();
            },
            after("getUser", users, (_, user) => decorate(user)),
            instead("getAvatarDecorationURL", images, function (this: any, args, original) {
                const options = args[0];
                const decoration = options?.avatarDecoration;
                if (decoration?.skuId === SKU_ID && typeof decoration.asset === "string") return decorationUrl(decoration.asset, !!options.canAnimate);
                return original.apply(this, args);
            }),
        );
        if (typeof users.getCurrentUser === "function") cleanup(after("getCurrentUser", users, (_, user) => decorate(user)));

        // Who is seen: message authors, people in member lists, and opened profiles
        try {
            cleanup(onMessageRow("decor", (_, message) => {
                if (!message?.author?.bot) see(message?.author?.id);
            }));
        } catch (e) {
            logger.warn("Chat authors won't be asked about", e);
        }
        for (const row of findByTypeNameAll("UserRow")) {
            if (typeof row?.type === "function") cleanup(after("type", row, ([props]) => void (props?.user?.bot || see(props?.user?.id))));
        }
        const profiles = getStore("UserProfileStore");
        if (typeof profiles?.getUserProfile === "function") cleanup(after("getUserProfile", profiles, ([id]) => void see(id)));

        // Your own, asked again once each start like on PC, so a decoration you just picked shows
        let askedMine = false;
        const askMine = () => {
            const me = currentUserId();
            if (!me) return;
            see(me, !askedMine);
            askedMine = true;
        };
        askMine();
        cleanup(subscribe("CONNECTION_OPEN", askMine));
        if ([...known.values()].some(k => k.a)) redrawProfiles();
    },
});
