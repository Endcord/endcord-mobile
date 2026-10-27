/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import { addMessageAction, displayName, getChannel, getUser, jumpTo } from "../hooks";
import { choose } from "../ui/dialogs";

export default definePlugin({
    id: "endcord.mutual-group-dms",
    name: "MutualGroupDMs",
    description: tx("See the group DMs you share with a message's author, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "GroupIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        const groupsWith = (userId: string) => (getStore("PrivateChannelSortStore")?.getPrivateChannelIds?.() ?? [])
            .map((id: string) => getChannel(id))
            .filter((c: any) => c?.type === 3 && c.recipients?.includes(userId));
        cleanup(addMessageAction({
            key: "mutual-group-dms",
            icon: "GroupIcon",
            label: () => t("Mutual Group DMs"),
            visible: message => !!message.author?.id && message.author.id !== currentUserId() && groupsWith(message.author.id).length > 0,
            onPress: message => choose(t("Mutual Group DMs"), groupsWith(message.author.id).map((c: any) => ({
                label: c.name || c.recipients.map((id: string) => displayName(getUser(id) ?? { id })).join(", "),
                value: c.id as string,
            })), (id: string) => {
                const last = getChannel(id)?.lastMessageId;
                if (last) jumpTo(id, last);
            }),
        }));
    },
});
