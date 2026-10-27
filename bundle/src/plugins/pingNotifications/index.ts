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
import { currentChannelId, displayName, getChannel, getUser } from "../hooks";

const preview = (text: string, length = 90) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

export default definePlugin({
    id: "endcord.ping-notifications",
    name: "PingNotifications",
    description: tx("Customizable notifications with improved mention formatting"),
    authors: [ENDCORD_AUTHOR],
    icon: "AtIcon",
    tags: ["Notifications"],
    settings: {
        mentions: { type: "boolean", label: tx("Mentions"), description: tx("Notify when someone @mentions you directly"), default: true },
        roles: { type: "boolean", label: tx("Role mentions"), description: tx("Notify when one of your roles is mentioned"), default: true },
        everyone: { type: "boolean", label: tx("@everyone and @here"), description: tx("Notify for @everyone and @here"), default: false },
        friends: { type: "boolean", label: tx("Friends"), description: tx("Notify when friends send messages in servers"), default: false },
        showInActive: { type: "boolean", label: tx("In the open chat too"), description: tx("Show notifications even for currently active channel"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            const me = currentUserId();
            if (optimistic || !message?.author || message.author.id === me) return;
            if (!store.showInActive && message.channel_id === currentChannelId()) return;
            const channel = getChannel(message.channel_id);
            if (!channel?.guild_id) return;
            const member = getStore("GuildMemberStore")?.getMember?.(channel.guild_id, me);
            const mentioned = (message.mentions ?? []).some((u: any) => (u?.id ?? u) === me);
            const roleMentioned = (message.mention_roles ?? []).some((id: string) => member?.roles?.includes(id));
            const reason = store.mentions && mentioned ? "mention"
                : store.roles && roleMentioned ? "role"
                    : store.everyone && message.mention_everyone ? "everyone"
                        : store.friends && getStore("RelationshipStore")?.isFriend?.(message.author.id) ? "friend" : undefined;
            if (!reason) return;
            // Mentions shown as names, not as <@id>
            const content = String(message.content ?? "")
                .replace(/<@!?(\d+)>/g, (_, id) => `@${displayName(getUser(id) ?? { id })}`)
                .replace(/<@&(\d+)>/g, (_, id) => `@${getStore("GuildRoleStore")?.getRole?.(channel.guild_id, id)?.name ?? t("role")}`)
                .replace(/<#(\d+)>/g, (_, id) => `#${getChannel(id)?.name ?? "?"}`)
                .replace(/<a?:(\w+):\d+>/g, ":$1:");
            showToast(`${displayName(message.author)} · #${channel.name}: ${preview(content, 90)}`, findAssetId(reason === "friend" ? "FriendsIcon" : "AtIcon"));
        }));
    },
});
