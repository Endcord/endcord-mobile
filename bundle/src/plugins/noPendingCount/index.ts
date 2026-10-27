/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { getStore } from "../common";

export default definePlugin({
    id: "endcord.no-pending-count",
    name: "NoPendingCount",
    description: tx("Removes the badge count of incoming friend requests and message requests"),
    icon: "UserPlusIcon",
    tags: ["Notifications"],
    settings: {
        hideFriendRequestsCount: { type: "boolean", label: tx("Friend requests"), description: tx("Hide incoming friend requests count"), default: true },
        hideMessageRequestsCount: { type: "boolean", label: tx("Message requests"), description: tx("Hide message requests count"), default: true },
    },
    start({ store, cleanup }) {
        const relationships = getStore("RelationshipStore");
        const requests = getStore("MessageRequestStore");
        if (typeof relationships?.getPendingCount === "function") {
            cleanup(instead("getPendingCount", relationships, (args, original) => store.hideFriendRequestsCount ? 0 : original(...args)));
        }
        if (typeof requests?.getMessageRequestsCount === "function") {
            cleanup(instead("getMessageRequestsCount", requests, (args, original) => store.hideMessageRequestsCount ? 0 : original(...args)));
        }
        relationships?.emitChange?.();
        requests?.emitChange?.();
        cleanup(() => {
            relationships?.emitChange?.();
            requests?.emitChange?.();
        });
    },
});
