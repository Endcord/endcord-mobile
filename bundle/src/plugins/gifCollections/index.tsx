/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, botMessage, command, currentChannelId, send } from "../hooks";
import { extension } from "../shared/media";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const collections = wrapSync(createStorage<{ sets: Record<string, string[]>; }>(createMMKVBackend("ENDCORD_GIF_COLLECTIONS", { sets: {} })));

const NEW_COLLECTION = "endcord:new";

const gifsIn = (m: any): string[] => [
    ...(m.attachments ?? []).filter((a: any) => extension(a.filename) === "gif").map((a: any) => a.url),
    ...(m.embeds ?? []).filter((e: any) => e.type === "gifv" || /tenor\.com|giphy\.com/.test(e.url ?? "")).map((e: any) => e.url),
    ...(String(m.content ?? "").match(/https?:\/\/\S+\.gif\b\S*/g) ?? []),
].filter(Boolean);

function addToCollection(name: string, url: string) {
    const sets = { ...(collections.sets ?? {}) };
    sets[name] = [...new Set([url, ...(sets[name] ?? [])])];
    collections.sets = sets;
    showToast(t("Saved to {collection}", { collection: name }), findAssetId("GifIcon"));
}

function CollectionsPage() {
    useProxy(collections);
    return <LogList
        title={t("GIF Collections")}
        empty={t("Long-press a message with a GIF and choose Save to Collection")}
        entries={Object.entries(collections.sets ?? {}).map(([name, gifs]) => ({
            key: name,
            label: name,
            subLabel: t("{count} GIFs", { count: gifs.length }),
            icon: "GifIcon",
            onPress: () => choose(name, [
                ...gifs.map(url => ({ label: url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60), value: url })),
                { label: t("Delete Collection"), value: "endcord:delete", danger: true },
            ], value => {
                if (value === "endcord:delete") {
                    const sets = { ...(collections.sets ?? {}) };
                    delete sets[name];
                    collections.sets = sets;
                } else {
                    const channelId = currentChannelId();
                    if (channelId) send(channelId, value);
                }
            }),
        }))}
    />;
}

export default definePlugin({
    id: "endcord.gif-collections",
    name: "GifCollections",
    description: tx("Allows you to create collections of gifs."),
    authors: [ENDCORD_AUTHOR],
    icon: "GifIcon",
    tags: ["Media", "Fun"],
    SettingsComponent: CollectionsPage,
    async start({ cleanup }) {
        await awaitStorage(collections);
        cleanup(
            addMessageAction({
                key: "gif-collections",
                icon: "GifIcon",
                label: () => t("Save to Collection"),
                visible: m => gifsIn(m).length > 0,
                onPress: m => {
                    const url = gifsIn(m)[0];
                    choose(t("Save to Collection"), [
                        ...Object.keys(collections.sets ?? {}).map(name => ({ label: name, value: name })),
                        { label: t("New Collection…"), value: NEW_COLLECTION },
                    ], name => name !== NEW_COLLECTION ? addToCollection(name, url) : prompt({
                        title: t("New Collection"),
                        placeholder: t("Collection name"),
                        onSubmit: value => addToCollection(value.trim(), url),
                    }));
                },
            }),
            command({
                name: "gif",
                description: tx("Send a random GIF from one of your collections"),
                options: [{ name: "collection", description: tx("The collection's name"), required: true }],
                run: ({ collection }, ctx) => {
                    const gifs = collections.sets?.[String(collection).trim()] ?? [];
                    if (!gifs.length) {
                        botMessage(ctx.channel.id, t("You have no collection called {name}.", { name: collection }));
                        return;
                    }
                    return gifs[Math.floor(Math.random() * gifs.length)];
                },
            }),
        );
    },
});
