/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's FakeFriends: someone shows as your friend, or as having sent you a friend request, on this phone only.
 * PC adds them from a user's right-click menu; here it's a message's long-press sheet, and the plugin's settings list
 * them. As on PC they're kept until Discord restarts, and accepting a fake request makes a fake friend.
 *
 * Unlike PC, nothing goes through Discord's own data: what its friend lists read is changed, and Discord's stores keep
 * the real relationships. Whatever Discord would send about a fake one (accepting, removing, a nickname) is answered
 * here and never sent, so accepting a fake request can't send someone a real one; blocking and ignoring someone still
 * happen for real. PC's "fake requests from a whole server" isn't here: it asks Discord for the server's whole member
 * list and looks up each member, which is a lot of requests in a row.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { useEffect, useState } from "react";

import { definePlugin } from "../api";
import { currentUserId, getStore, moduleAt, subscribe } from "../common";
import { addMessageAction, displayName, getUser, HTTP } from "../hooks";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";
import { BLOCKED, type Fake, type FakeState, isBlockOrIgnore, NONE, relationshipTarget, typeOf, urlOf, userIdOf, withFakeIds, withFakeSinces, withFakeTypes } from "./logic";

/** In memory only, as on Endcord PC: they're gone when Discord restarts */
const fakes = new Map<string, Fake>();
const listeners = new Set<() => void>();
let version = 0;
let redrawLists: (() => void) | undefined;

function changed() {
    version++;
    for (const listener of listeners) {
        try {
            listener();
        } catch { }
    }
    redrawLists?.();
}

const nameOf = (id: string) => {
    const user = getUser(id);
    return user ? displayName(user) : id;
};

function dropFake(id: string) {
    if (fakes.delete(id)) changed();
}

/** The fakes that show while the plugin runs: those with no real relationship */
let shownFakes: (() => string[]) | undefined;

/**
 * The IDs of the fake friends and requests that show, for plugins that tell about relationships changing. Someone
 * kept as a fake who has a real relationship with you now isn't one: what's real is what counts
 */
export const fakeRelationshipIds = (): string[] => shownFakes?.() ?? [];

/** A response like Discord's to a request that went through, for what calls its API about a fake friend */
const DONE = Object.freeze({ ok: true, status: 204, body: null, headers: {}, text: "" });

function FakeFriendsPage() {
    const [, update] = useState(0);
    useEffect(() => {
        const listener = () => update(n => n + 1);
        listeners.add(listener);
        return () => void listeners.delete(listener);
    }, []);
    return <LogList
        title={t("Fake Friends")}
        empty={t("Long-press someone's message and choose Fake Friend or Fake Friend Request. Only you see them.")}
        entries={[...fakes].map(([id, fake]) => ({
            key: id,
            label: nameOf(id),
            subLabel: fake.state === "friend" ? t("Fake friend") : t("Fake friend request"),
            icon: "FriendsIcon",
            onPress: () => choose(nameOf(id), [{
                label: fake.state === "pending" ? t("Cancel the fake request") : t("Remove from fake friends"),
                value: id,
                icon: "UserMinusIcon",
                danger: true,
            }], dropFake),
        }))}
        onClear={() => {
            fakes.clear();
            changed();
        }}
    />;
}

export default definePlugin({
    id: "endcord.fake-friends",
    name: "FakeFriends",
    description: tx("Locally simulates Discord friends and friend requests. Only you see them, and they're gone when Discord restarts."),
    icon: "FriendsIcon",
    tags: ["Fun", "Friends"],
    SettingsComponent: FakeFriendsPage,
    start({ cleanup, logger }) {
        const store = getStore("RelationshipStore");
        if (typeof store?.getRelationshipType !== "function") throw new Error("Discord's friends weren't found");

        // Discord's own answers, for the checks here: the patches below step aside while these run
        let bypass = 0;
        const real = <T,>(read: () => T): T => {
            bypass++;
            try {
                return read();
            } finally {
                bypass--;
            }
        };
        const realType = (id: string): number => real(() => store.getRelationshipType(id)) ?? NONE;

        // The fakes that show: only for someone with no real relationship, whom Discord knows. Worked out again when
        // they or the real relationships change, since the lists read them all the time
        let activeKey = "";
        let active: Array<[string, Fake]> = [];
        let activeById = new Map<string, Fake>();
        const current = () => {
            const key = `${version}:${fakes.size ? real(() => store.getVersion?.()) ?? 0 : 0}`;
            if (key !== activeKey) {
                activeKey = key;
                active = [...fakes].filter(([id]) => {
                    const user = getUser(id);
                    return !!user && !user.bot && realType(id) === NONE;
                });
                activeById = new Map(active);
            }
            return active;
        };
        const fakeOf = (id: unknown) => typeof id === "string" && current().length ? activeById.get(id) : undefined;
        shownFakes = () => current().map(([id]) => id);
        const count = (state?: FakeState) => current().filter(([, fake]) => !state || fake.state === state).length;

        // Discord compares what its stores return by reference: each list with the fakes in it is made once, until
        // Discord's own list or the fakes change, or it would draw again and again
        const views = new WeakMap<object, { key: string; value: unknown; }>();
        const view = (value: any, make: (value: any) => unknown) => {
            if (!value || typeof value !== "object" || !current().length) return value;
            const kept = views.get(value);
            if (kept?.key === activeKey) return kept.value;
            const made = make(value);
            views.set(value, { key: activeKey, value: made });
            return made;
        };

        const patch = (name: string, read: (args: any[], original: (...args: any[]) => any) => unknown) => {
            if (typeof store[name] !== "function") return;
            cleanup(instead(name, store, function (this: any, args, original) {
                const call = (...a: any[]) => original.apply(this, a);
                if (bypass || !fakes.size) return call(...args);
                return read(args, call);
            }));
        };
        patch("getRelationshipType", ([id], original) => {
            const fake = fakeOf(id);
            return fake ? typeOf(fake.state) : original(id);
        });
        patch("isFriend", ([id], original) => fakeOf(id)?.state === "friend" || original(id));
        patch("isUnfilteredPendingIncoming", ([id], original) => fakeOf(id)?.state === "pending" || original(id));
        patch("getSince", ([id], original) => fakeOf(id)?.since ?? original(id));
        patch("getFriendIDs", (args, original) => view(original(...args), ids => withFakeIds(ids, current().filter(([, f]) => f.state === "friend").map(([id]) => id))));
        patch("getMutableRelationships", (args, original) => view(original(...args), all => withFakeTypes(all, current().map(([id, f]) => [id, f.state]))));
        patch("getSinces", (args, original) => view(original(...args), all => withFakeSinces(all, current())));
        const plus = (state?: FakeState) => (args: any[], original: (...a: any[]) => any) => {
            const value = original(...args);
            return typeof value === "number" ? value + count(state) : value;
        };
        patch("getPendingCount", plus("pending"));
        patch("getFriendCount", plus("friend"));
        patch("getRelationshipCount", plus());
        // Lists that only work again when the version changes see the fakes change too, removing them included
        if (typeof store.getVersion === "function") cleanup(instead("getVersion", store, function (this: any, args, original) {
            const value = original.apply(this, args);
            return !bypass && typeof value === "number" ? value + version : value;
        }));

        redrawLists = () => {
            try {
                store.emitChange?.();
            } catch { }
        };

        // A fake one is only answered here while there's nothing real between you
        const isFake = (id: string | undefined): id is string => {
            if (!id || !fakes.has(id)) return false;
            if (realType(id) === NONE) return true;
            // Something real happened since: that's what counts
            dropFake(id);
            return false;
        };
        const accept = (id: string) => {
            if (fakes.get(id)?.state === "pending") {
                fakes.set(id, { state: "friend", since: new Date().toISOString() });
                changed();
            }
        };

        // Discord's friend actions: what they'd send about a fake one is done here instead
        const answer = (module: any, name: string, handle: (id: string, args: any[]) => "local" | "send") => {
            if (typeof module?.[name] !== "function") return;
            cleanup(instead(name, module, function (this: any, args, original) {
                const id = userIdOf(args[0]);
                if (!isFake(id) || handle(id, args) === "send") return original.apply(this, args);
                return Promise.resolve();
            }));
        };
        const actions = moduleAt("actions/RelationshipActionCreators.tsx")?.default;
        const people = moduleAt("modules/people/PeopleUtils.tsx")?.default;
        if (!actions) logger.warn("Discord's friend actions weren't found; requests about fake friends are still stopped before they're sent");
        for (const module of [actions, people]) {
            answer(module, "acceptFriendRequest", id => (accept(id), "local"));
            answer(module, "maybeConfirmFriendRequestAccept", id => (accept(id), "local"));
            // Blocking someone is real, whatever this plugin shows
            answer(module, "addRelationship", (id, [arg]) => {
                if (arg?.type === BLOCKED) {
                    dropFake(id);
                    return "send";
                }
                accept(id);
                return "local";
            });
            // So is ignoring someone: it hides what they send you
            for (const name of ["blockUser", "ignoreUser"]) answer(module, name, id => (dropFake(id), "send"));
            for (const name of ["cancelFriendRequest", "removeFriend", "removeRelationship"]) answer(module, name, id => (dropFake(id), "local"));
            answer(module, "updateRelationship", () => "local");
        }

        // Anything else that calls Discord's API about a fake one never reaches it: accepting a fake request mustn't
        // send that person a real one
        const http = HTTP();
        const holders = [...new Set([http, http?.HTTP].filter(h => h && typeof h === "object"))];
        let guarded = 0;
        for (const holder of holders) {
            for (const method of ["put", "post", "patch", "del", "delete"]) {
                if (typeof holder[method] !== "function") continue;
                try {
                    cleanup(instead(method, holder, function (this: any, args, original) {
                        const id = relationshipTarget(urlOf(args[0]));
                        if (!isFake(id)) return original.apply(this, args);
                        // Blocking or ignoring them is real: the fake goes, and the request goes through
                        if (isBlockOrIgnore(method, args[0])) {
                            dropFake(id);
                            return original.apply(this, args);
                        }
                        const url = String(urlOf(args[0]));
                        if (method === "put" && !/\/relationships\/\d+\//.test(url)) accept(id);
                        else if (method !== "patch") dropFake(id);
                        return Promise.resolve(DONE);
                    }));
                    guarded++;
                } catch (e) {
                    logger.warn(`Discord's ${method} requests couldn't be watched`, e);
                }
            }
        }
        if (!guarded && !actions) throw new Error("Discord's friend requests couldn't be watched, so a fake one could reach Discord");

        const canFake = (message: any) => {
            const author = message?.author;
            return typeof author?.id === "string" && author.id !== currentUserId() && !author.bot && !author.system
                && !fakes.has(author.id) && realType(author.id) === NONE;
        };
        const add = (id: string, state: FakeState) => {
            const user = getUser(id);
            if (!user || user.bot) {
                showToast(t("Couldn't find that user."), findAssetId("CircleXIcon-primary"));
                return;
            }
            fakes.set(id, { state, since: new Date().toISOString() });
            changed();
            showToast(state === "friend"
                ? t("{name} is a fake friend now. Only you see this.", { name: displayName(user) })
                : t("{name} sent you a fake friend request. Only you see it.", { name: displayName(user) }), findAssetId("FriendsIcon"));
        };

        cleanup(
            addMessageAction({
                key: "fake-friends-friend",
                icon: "UserPlusIcon",
                label: () => t("Fake Friend"),
                visible: canFake,
                onPress: message => add(message.author.id, "friend"),
            }),
            addMessageAction({
                key: "fake-friends-request",
                icon: "UserPlusIcon",
                label: () => t("Fake Friend Request"),
                visible: canFake,
                onPress: message => add(message.author.id, "pending"),
            }),
            addMessageAction({
                key: "fake-friends-remove",
                icon: "UserMinusIcon",
                danger: true,
                label: message => fakes.get(message.author?.id)?.state === "pending" ? t("Cancel the fake request") : t("Remove from fake friends"),
                visible: message => typeof message?.author?.id === "string" && fakes.has(message.author.id),
                onPress: message => dropFake(message.author.id),
            }),
            // Someone who becomes a real friend, request or block isn't a fake any more, and doesn't come back as one
            // when that ends
            subscribe("RELATIONSHIP_ADD", ({ relationship }) => {
                const id = relationship?.id;
                if (typeof id === "string" && fakes.has(id)) dropFake(id);
            }),
            () => {
                redrawLists = undefined;
                shownFakes = undefined;
                // After the patches are off, so the lists show only the real ones again
                setTimeout(() => {
                    try {
                        store.emitChange?.();
                    } catch { }
                }, 0);
            },
        );
        if (fakes.size) changed();
    },
});
