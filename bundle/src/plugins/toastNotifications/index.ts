/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { currentChannelId, displayName, getChannel } from "../hooks";
import { ids, placeOf, preview } from "../shared/notify";

export default definePlugin({
    id: "endcord.toast-notifications",
    name: "ToastNotifications",
    description: tx("Show a pop-up toast notification, configurable for DMs, group, friends, or guild channels."),
    authors: [ENDCORD_AUTHOR],
    icon: "BellIcon",
    tags: ["Notifications"],
    settings: {
        directMessages: { type: "boolean", label: tx("Direct messages"), description: tx("Show notifications for direct messages."), default: true },
        groupMessages: { type: "boolean", label: tx("Group messages"), description: tx("Show notifications for group messages."), default: true },
        friendServerNotifications: { type: "boolean", label: tx("Friends in servers"), description: tx("Show notifications when friends send messages in servers they share with you."), default: false },
        respectDoNotDisturb: { type: "boolean", label: tx("Respect Do Not Disturb"), description: tx("Do not show notifications when your status is Do Not Disturb."), default: true },
        ignoreUsers: { type: "string", label: tx("Ignored users"), description: tx("A list of user IDs (separate by commas) to ignore displaying notifications for."), default: "" },
        notifyFor: { type: "string", label: tx("Always notify for"), description: tx("A list of channel IDs (separate by commas) to always receive notifications from."), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            const me = currentUserId();
            const author = message?.author;
            if (optimistic || !author || author.id === me || message.channel_id === currentChannelId()) return;
            if (ids(store.ignoreUsers).has(author.id)) return;
            if (store.respectDoNotDisturb && getStore("PresenceStore")?.getStatus?.(me) === "dnd") return;
            const channel = getChannel(message.channel_id);
            const always = ids(store.notifyFor).has(message.channel_id);
            const wanted = always
                || channel?.type === 1 && store.directMessages
                || channel?.type === 3 && store.groupMessages
                || channel?.guild_id && store.friendServerNotifications && getStore("RelationshipStore")?.isFriend?.(author.id);
            if (!wanted) return;
            const body = message.content || (message.attachments?.length ? t("Sent an attachment") : message.sticker_items?.length ? t("Sent a sticker") : "");
            showToast(`${displayName(author)}${channel?.guild_id || channel?.type === 3 ? ` · ${placeOf(message.channel_id)}` : ""}: ${preview(body, 90)}`, findAssetId("ChatIcon"));
        }));
    },
});
