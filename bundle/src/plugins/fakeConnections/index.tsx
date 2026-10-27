/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { Stack } from "@metro/common/components";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import { rewriteResult } from "../shared/navigation";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const CONNECTION_TYPES = ["github", "twitch", "youtube", "steam", "spotify", "reddit", "twitter", "xbox", "playstation", "tiktok", "instagram", "battlenet", "epicgames", "riotgames", "roblox", "bluesky", "domain"];

const fakeConnections = wrapSync(createStorage<{ items: Array<{ type: string; name: string; }>; }>(createMMKVBackend("ENDCORD_FAKE_CONNECTIONS", { items: [] })));

const connectionList = () => Array.isArray(fakeConnections.items) ? fakeConnections.items : [];

let refreshConnections: (() => void) | undefined;

function ConnectionsPage() {
    useProxy(fakeConnections);
    return <Stack spacing={8}>
        <LogList
            title={t("Fake connections")}
            empty={t("None yet")}
            entries={connectionList().map((c, i) => ({
                key: `${c.type}:${c.name}:${i}`,
                label: c.name,
                subLabel: c.type,
                icon: "LinkIcon",
                onPress: () => choose(c.name, [{ label: t("Remove"), value: i, danger: true }], index => {
                    fakeConnections.items = connectionList().filter((_, j) => j !== index);
                    refreshConnections?.();
                }),
            }))}
        />
        <LogList
            title={t("Add")}
            empty=""
            entries={[{
                key: "add",
                label: t("Add a Connection…"),
                icon: "PlusSmallIcon",
                onPress: () => choose(t("Service"), CONNECTION_TYPES.map(type => ({ label: type, value: type })), type => prompt({
                    title: type,
                    placeholder: t("Name shown on your profile"),
                    onSubmit: name => {
                        if (!name.trim()) throw new Error(t("Enter a name"));
                        fakeConnections.items = [...connectionList(), { type, name: name.trim() }];
                        refreshConnections?.();
                    },
                })),
            }]}
        />
    </Stack>;
}

export default definePlugin({
    id: "endcord.fake-connections",
    name: "FakeConnections",
    description: tx("Add fake connections to your own profile, visible only to you."),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Customisation", "Fun"],
    SettingsComponent: ConnectionsPage,
    async start({ cleanup }) {
        await awaitStorage(fakeConnections);
        const store = getStore("UserProfileStore");
        const patch = rewriteResult(store, "getUserProfile", profile => {
            if (profile.userId !== currentUserId() || !connectionList().length) return profile;
            const fakes = connectionList().map((c, i) => ({ type: c.type, name: c.name, id: `endcord-${i}`, verified: true }));
            const accounts = [...profile.connectedAccounts ?? [], ...fakes];
            // A view of Discord's profile with more accounts; the profile itself, and its methods, stay as they are
            return new Proxy(profile, {
                get(target, key) {
                    if (key === "connectedAccounts") return accounts;
                    const value = Reflect.get(target, key, target);
                    return typeof value === "function" ? value.bind(target) : value;
                },
            });
        });
        if (!patch) throw new Error("Discord's profiles weren't found");
        refreshConnections = patch.refresh;
        cleanup(() => {
            refreshConnections = undefined;
            patch.unpatch();
            store?.emitChange?.();
        });
        patch.refresh();
    },
});
