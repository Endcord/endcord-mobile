/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's BetterForwards, the part a phone can have: a forwarded message from another server says which server it
 * came from, next to its time, as PC's footer under forwards does. Discord's own footer already names the channel.
 * Only servers you're in are named: PC looks the others up on Discord, which the phone doesn't do for a message.
 *
 * Not here: PC's forward window changes (picking which attachments go, showing the current channel, not jumping to
 * the forward) rebuild Discord desktop's window, and the phone's forward sheet offers nothing to change them by. Its
 * resend-as-text, which gets around Discord's NSFW rule for forwards and sends messages by itself, isn't ported.
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { appendToTimestamp, getChannel, getGuild, onMessageRow, RowOrder } from "../hooks";

/** Discord's type for a message reference that is a forward */
const FORWARD = 1;
const SNOWFLAKE = /^\d{17,20}$/;
const MAX_NAME = 60;

/** Where a forwarded message came from, or undefined for any other message */
export function forwardSource(message: any): { guildId?: string; channelId?: string; } | undefined {
    const reference = message?.messageReference ?? message?.message_reference;
    if (!reference || typeof reference !== "object") return undefined;
    const snapshots = message.messageSnapshots ?? message.message_snapshots;
    if (reference.type !== FORWARD && !(Array.isArray(snapshots) && snapshots.length)) return undefined;
    const id = (value: unknown) => typeof value === "string" && SNOWFLAKE.test(value) ? value : undefined;
    return { guildId: id(reference.guild_id), channelId: id(reference.channel_id) };
}

/** A server's name as it goes after a time: on one line, and not too long */
export function shortName(name: unknown): string | undefined {
    if (typeof name !== "string") return undefined;
    const flat = name.replace(/\s+/g, " ").trim();
    if (!flat) return undefined;
    return flat.length > MAX_NAME ? `${flat.slice(0, MAX_NAME - 1)}…` : flat;
}

export default definePlugin({
    id: "endcord.better-forwards",
    name: "BetterForwards",
    description: tx("A forwarded message from another server says which server it came from, next to its time."),
    icon: "ArrowAngleRightUpIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("better-forwards", (row, message) => {
            const source = forwardSource(message);
            if (!source?.guildId) return;
            // Forwards from the server you're reading in need no name
            if (getChannel(message.channel_id)?.guild_id === source.guildId) return;
            const name = shortName(getGuild(source.guildId)?.name);
            if (name) appendToTimestamp(row, ` · ${t("from {server}", { server: name })}`);
        }, RowOrder.ADD));
    },
});
