/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { api } from "../hooks";
import { failed, INCOMING, nameOf, removeRelationship, since, useRelationships } from "../shared/people";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

function IncomingPage() {
    const incoming = useRelationships().filter(([, type]) => type === INCOMING).map(([id]) => id).sort((a, b) => since(b) - since(a));
    return <LogList
        title={t("Friend Requests, Newest First")}
        empty={t("You have no friend requests")}
        entries={incoming.map(id => ({
            key: id,
            label: nameOf(id),
            subLabel: since(id) ? new Date(since(id)).toLocaleString() : undefined,
            onPress: () => choose(nameOf(id), [
                { label: t("Accept"), value: "accept", icon: "CheckmarkLargeIcon" },
                { label: t("Ignore"), value: "ignore", icon: "TrashIcon", danger: true },
            ], action => action === "accept"
                ? api("put", `/users/@me/relationships/${id}`, {}).catch(failed)
                : removeRelationship(id).catch(failed)),
        }))}
    />;
}

export default definePlugin({
    id: "endcord.sort-friend-requests",
    name: "SortFriendRequests",
    description: tx("Your incoming friend requests, newest first, to accept or ignore in the plugin's settings"),
    icon: "UserPlusIcon",
    tags: ["Friends"],
    SettingsComponent: IncomingPage,
    start() { },
});
