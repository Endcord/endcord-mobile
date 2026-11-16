/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ReactionTimestamps: when each reaction was added. Like PC it notes the time of every reaction that
 * comes in while the app is open (Discord doesn't keep it), the newest 2000; PC shows it in the desktop reaction
 * popout, and on the phone it's a list in the message's long-press menu, there when the message has a noted reaction.
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { subscribe } from "../common";
import { addMessageAction, displayName, getUser } from "../hooks";
import { showText } from "../ui/dialogs";
import { describeTimes, ReactionTimes } from "./times";

export default definePlugin({
    id: "endcord.reaction-timestamps",
    name: "ReactionTimestamps",
    description: tx("Shows when each reaction was added, from the message menu. Only reactions added while the app is open are known."),
    icon: "ClockIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        const times = new ReactionTimes();
        cleanup(
            () => times.clear(),
            subscribe("MESSAGE_REACTION_ADD", e => {
                // Your own, before Discord confirms it; it's noted when it does
                if (!e?.optimistic) times.remember(e?.channelId, e?.messageId, e?.userId, e?.emoji);
            }),
            subscribe("MESSAGE_REACTION_REMOVE", e => times.forget(e?.channelId, e?.messageId, e?.userId, e?.emoji)),
            subscribe("MESSAGE_REACTION_REMOVE_ALL", e => times.forgetAll(e?.channelId, e?.messageId)),
            subscribe("MESSAGE_REACTION_REMOVE_EMOJI", e => e?.emoji && times.forgetAll(e?.channelId, e?.messageId, e.emoji)),
            addMessageAction({
                key: "reaction-timestamps",
                icon: "ClockIcon",
                label: () => t("Reaction Times"),
                visible: message => times.has(message.channel_id, message.id),
                onPress: message => showText(t("Reaction Times"), describeTimes(
                    times.of(message.channel_id, message.id),
                    userId => {
                        const user = getUser(userId);
                        return user ? `${displayName(user)} (${user.username ?? userId})` : userId;
                    },
                    at => new Date(at).toLocaleString(),
                )),
            }),
        );
    },
});
