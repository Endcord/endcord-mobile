/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { botMessage, command } from "../hooks";
import { OUTGOING, relationships, removeRelationship } from "../shared/people";

export default definePlugin({
    id: "endcord.cancel-friend-request-nc",
    name: "CancelFriendRequestNC",
    description: tx("Cancel every friend request you sent with /cancelrequests"),
    icon: "UserPlusIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        cleanup(command({
            name: "cancelrequests",
            description: tx("Cancel all the friend requests you sent"),
            run: async (_, ctx) => {
                const outgoing = relationships().filter(([, type]) => type === OUTGOING).map(([id]) => id);
                for (const id of outgoing) {
                    await removeRelationship(id).catch(() => { });
                    await new Promise(r => setTimeout(r, 600));
                }
                botMessage(ctx.channel.id, t("Cancelled {count} friend requests.", { count: outgoing.length }));
            },
        }));
    },
});
