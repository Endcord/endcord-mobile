/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Adapted from Endcord PC's MessageNotifier. PC shows a desktop notification you click to jump to the message; the
 * phone shows one of Discord's toasts instead, which can't be tapped, and only while Discord is open: the
 * notifications Android shows when it's closed are sent by Discord's servers, which plugins can't add to. Replies
 * count as messages too.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { currentChannelId, displayName, getChannel } from "../hooks";
import { placeOf } from "../shared/notify";
import { shouldNotify, userIds } from "./logic";

export default definePlugin({
    id: "endcord.message-notifier",
    name: "MessageNotifier",
    description: tx("Get a pop-up when chosen users send a message. Only while Discord is open: notifications when it's closed come from Discord's servers."),
    icon: "BellIcon",
    tags: ["Chat", "Notifications"],
    settings: {
        users: {
            type: "string",
            label: tx("Users"),
            description: tx("Comma separated list of user ids to get message toasts for"),
            placeholder: tx("Separate with commas"),
            default: "",
        },
    },
    start({ store, cleanup }) {
        // The list read again only when it changes, not for every message
        let read = { text: "", ids: new Set<string>() };
        const wanted = () => {
            if (store.users !== read.text) read = { text: store.users, ids: userIds(store.users) };
            return read.ids;
        };
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            if (optimistic || message?.state === "SENDING") return;
            if (!shouldNotify(message, wanted(), currentUserId(), currentChannelId())) return;
            const { author } = message;
            const name = getStore("RelationshipStore")?.getNickname?.(author.id) || displayName(author);
            const channel = getChannel(message.channel_id);
            showToast(channel?.type === 1
                ? t("{user} sent you a message", { user: name })
                : t("{user} sent a message in {place}", { user: name, place: placeOf(message.channel_id) || t("a chat") }), findAssetId("ChatIcon"));
        }));
    },
});
