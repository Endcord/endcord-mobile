/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { failed, nameOf, OUTGOING, removeRelationship, since, useRelationships } from "../shared/people";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

function OutgoingPage() {
    const outgoing = useRelationships().filter(([, type]) => type === OUTGOING).map(([id]) => id).sort((a, b) => since(b) - since(a));
    return <LogList
        title={t("Sent Friend Requests")}
        empty={t("You have no pending friend requests")}
        entries={outgoing.map(id => ({
            key: id,
            label: nameOf(id),
            subLabel: since(id) ? new Date(since(id)).toLocaleString() : undefined,
            onPress: () => choose(nameOf(id), [{ label: t("Cancel Friend Request"), value: "cancel", icon: "TrashIcon", danger: true }], () => removeRelationship(id).catch(failed)),
        }))}
    />;
}

export default definePlugin({
    id: "endcord.cancel-friend-request",
    name: "CancelFriendRequest",
    description: tx("See the friend requests you sent and cancel them"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserPlusIcon",
    tags: ["Friends"],
    SettingsComponent: OutgoingPage,
    start() { },
});
