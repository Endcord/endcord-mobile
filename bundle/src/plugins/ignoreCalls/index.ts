/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, onAction } from "../common";
import { getChannel } from "../hooks";
import { ids } from "../shared/filters";

export default definePlugin({
    id: "endcord.ignore-calls",
    name: "IgnoreCalls",
    description: tx("Allows you to ignore calls from specific users or dm groups."),
    authors: [ENDCORD_AUTHOR],
    icon: "PhoneHangUpIcon",
    tags: ["Privacy", "Voice"],
    settings: {
        permanentlyIgnoredUsers: {
            type: "string",
            label: tx("Ignored callers"),
            description: tx("User IDs (comma + space) who should be permanently ignored"),
            placeholder: tx("e.g. 123456789012345678, 234567890123456789"),
            default: "",
        },
        ignoredGroups: { type: "string", label: tx("Ignored group DMs"), description: tx("Channel IDs of group DMs whose calls don't ring"), default: "" },
    },
    start({ store, cleanup }) {
        const unring = (payload: { channelId: string; ringing?: string[]; }) => {
            const me = currentUserId();
            if (!me || !payload.ringing?.includes(me)) return;
            const channel = getChannel(payload.channelId);
            const ignored = ids(store.permanentlyIgnoredUsers);
            const fromIgnored = channel?.recipients?.length === 1 ? ignored.has(channel.recipients[0]) : ids(store.ignoredGroups).has(payload.channelId);
            if (fromIgnored) return { ringing: payload.ringing.filter(id => id !== me) };
        };
        cleanup(onAction("CALL_CREATE", unring as any), onAction("CALL_UPDATE", unring as any));
    },
});
