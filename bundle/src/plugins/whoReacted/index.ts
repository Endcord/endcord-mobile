/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, api } from "../hooks";
import { failed } from "../shared/people";
import { showText } from "../ui/dialogs";

export default definePlugin({
    id: "endcord.who-reacted",
    name: "WhoReacted",
    description: tx("See who reacted to a message with each emoji, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "who-reacted",
            icon: "ReactionIcon",
            label: () => t("Who Reacted"),
            visible: message => (message.reactions?.length ?? 0) > 0,
            onPress: async message => {
                try {
                    const parts = await Promise.all((message.reactions as any[]).slice(0, 10).map(async r => {
                        const emoji = r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : r.emoji.name;
                        const users: any[] = await api("get", `/channels/${message.channel_id}/messages/${message.id}/reactions/${encodeURIComponent(emoji)}?limit=100`);
                        return `${r.emoji.id ? `:${r.emoji.name}:` : r.emoji.name} ${r.count}\n${users.map(u => u.global_name ?? u.username).join(", ")}`;
                    }));
                    showText(t("Who Reacted"), parts.join("\n\n"));
                } catch (e) {
                    failed(e);
                }
            },
        }));
    },
});
