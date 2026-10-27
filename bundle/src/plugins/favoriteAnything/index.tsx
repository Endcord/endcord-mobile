/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { addMessageAction, copy, currentChannelId, openUrl, send } from "../hooks";
import { pick } from "../shared/media";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

interface Favorite {
    url: string;
    filename: string;
    at: number;
}

const favorites = wrapSync(createStorage<{ items: Favorite[]; }>(createMMKVBackend("ENDCORD_FAVORITE_MEDIA", { items: [] })));

const favoriteList = () => Array.isArray(favorites.items) ? favorites.items : [];

function FavoritesPage() {
    useProxy(favorites);
    return <LogList
        title={t("Favorites")}
        empty={t("Long-press a message with an attachment and choose Favorite")}
        entries={favoriteList().map(f => ({
            key: f.url,
            label: f.filename,
            subLabel: new Date(f.at).toLocaleDateString(),
            icon: "StarIcon",
            onPress: () => choose(f.filename, [
                { label: t("Send to This Chat"), value: "send", icon: "SendMessageIcon" },
                { label: t("Open"), value: "open", icon: "LinkExternalSmallIcon" },
                { label: t("Copy Link"), value: "copy", icon: "CopyIcon" },
                { label: t("Remove"), value: "remove", icon: "TrashIcon", danger: true },
            ], action => {
                const channelId = currentChannelId();
                if (action === "send" && channelId) send(channelId, f.url);
                else if (action === "open") openUrl(f.url);
                else if (action === "copy") copy(f.url);
                else if (action === "remove") favorites.items = favoriteList().filter(x => x.url !== f.url);
            }),
        }))}
    />;
}

export default definePlugin({
    id: "endcord.favorite-anything",
    name: "FavoriteAnything",
    description: tx("Favorite any image, video, or file attachment"),
    icon: "StarIcon",
    tags: ["Media"],
    SettingsComponent: FavoritesPage,
    async start({ cleanup }) {
        await awaitStorage(favorites);
        cleanup(addMessageAction({
            key: "favorite-anything",
            icon: "StarIcon",
            label: () => t("Favorite"),
            visible: m => (m.attachments?.length ?? 0) > 0,
            onPress: m => pick(t("Favorite"), m.attachments, (a: any) => {
                if (favoriteList().some(f => f.url === a.url)) return showToast(t("It's already a favorite"), findAssetId("StarIcon"));
                favorites.items = [{ url: a.url, filename: a.filename, at: Date.now() }, ...favoriteList()];
                showToast(t("Added to your favorites"), findAssetId("StarIcon"));
            }),
        }));
    },
});
