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
import { addMessageAction, botMessage, command, jumpTo, messageLink } from "../hooks";
import { preview, Saved, savedFrom } from "../shared/schedule";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

const bookmarks = wrapSync(createStorage<{ items: Saved[]; }>(createMMKVBackend("ENDCORD_BOOKMARKS", { items: [] })));

const bookmarked = () => Array.isArray(bookmarks.items) ? bookmarks.items : [];

function BookmarkList() {
    useProxy(bookmarks);
    return <LogList
        title={t("Bookmarks")}
        empty={t("Long-press a message and choose Bookmark to save it here")}
        entries={bookmarked().map(b => ({
            key: b.id,
            label: `${b.author}: ${preview(b.content)}`,
            subLabel: new Date(b.at).toLocaleDateString(),
            icon: "BookmarkIcon",
            onPress: () => choose(preview(b.content, 40), [
                { label: t("Jump to Message"), value: "jump", icon: "ArrowAngleLeftUpIcon" },
                { label: t("Remove Bookmark"), value: "remove", icon: "TrashIcon", danger: true },
            ], action => {
                if (action === "jump") jumpTo(b.channelId, b.id);
                else bookmarks.items = bookmarked().filter(x => x.id !== b.id);
            }),
        }))}
    />;
}

export default definePlugin({
    id: "endcord.bookmarks",
    name: "Bookmarks",
    description: tx("Privately bookmark messages (beyond Discord's 50-pin limit) from the message menu, then find and jump to them in the plugin's settings or with /bookmarks"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookmarkIcon",
    tags: ["Utility", "Chat"],
    SettingsComponent: BookmarkList,
    async start({ cleanup }) {
        await awaitStorage(bookmarks);
        cleanup(
            addMessageAction({
                key: "bookmarks",
                icon: "BookmarkIcon",
                label: message => bookmarked().some(b => b.id === message.id) ? t("Remove Bookmark") : t("Bookmark"),
                onPress: message => {
                    if (bookmarked().some(b => b.id === message.id)) {
                        bookmarks.items = bookmarked().filter(b => b.id !== message.id);
                        showToast(t("Bookmark removed"), findAssetId("BookmarkIcon"));
                    } else {
                        bookmarks.items = [savedFrom(message), ...bookmarked()];
                        showToast(t("Bookmarked. Find it in the Bookmarks plugin's settings."), findAssetId("BookmarkIcon"));
                    }
                },
            }),
            command({
                name: "bookmarks",
                description: tx("List your bookmarks (only you see it)"),
                run: (_, ctx) => {
                    const items = bookmarked().slice(0, 25);
                    botMessage(ctx.channel.id, items.length
                        ? items.map(b => `🔖 **${b.author}**: ${preview(b.content, 60)}\n${messageLink(b.channelId, b.id)}`).join("\n")
                        : t("Long-press a message and choose Bookmark to save it here"));
                },
            }),
        );
    },
});
