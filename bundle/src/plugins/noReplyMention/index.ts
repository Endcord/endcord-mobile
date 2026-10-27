/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { before } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { splitList } from "../shared/compose";

export default definePlugin({
    id: "endcord.no-reply-mention",
    name: "NoReplyMention",
    description: tx("Disables reply pings by default"),
    icon: "AtIcon",
    tags: ["Chat"],
    settings: {
        userList: {
            type: "string",
            label: tx("Exceptions"),
            description: tx("User IDs (comma separated) treated the other way round"),
            default: "",
        },
        shouldPingListed: {
            type: "boolean",
            label: tx("Ping the users in the list"),
            description: tx("On: replies to them ping and others don't. Off: replies to them don't ping and others do."),
            default: true,
        },
    },
    start({ store, cleanup }) {
        const actions = findByProps("createPendingReply");
        if (typeof actions?.createPendingReply !== "function") throw new Error("Discord's reply actions weren't found");
        cleanup(before("createPendingReply", actions, ([reply]: any[]) => {
            if (!reply || typeof reply !== "object") return;
            const listed = splitList(store.userList).includes(reply.message?.author?.id);
            reply.shouldMention = listed ? store.shouldPingListed : !store.shouldPingListed;
        }));
    },
});
