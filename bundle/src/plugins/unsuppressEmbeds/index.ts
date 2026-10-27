/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { addMessageAction, api } from "../hooks";
import { isMine } from "../shared/actions";

const SUPPRESS_EMBEDS = 1 << 2;

export default definePlugin({
    id: "endcord.unsuppress-embeds",
    name: "UnsuppressEmbeds",
    description: tx("Allows you to unsuppress embeds in messages"),
    icon: "EmbedIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        const canManage = (channel: any) => {
            const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions;
            return !!(permissions && getStore("PermissionStore")?.can?.(permissions.MANAGE_MESSAGES, channel));
        };
        cleanup(addMessageAction({
            key: "unsuppress-embeds",
            icon: "EmbedIcon",
            label: message => message.flags & SUPPRESS_EMBEDS ? t("Unsuppress Embeds") : t("Suppress Embeds"),
            visible: (message, channel) => /https?:\/\//.test(message.content ?? "") && (isMine(message) || !!channel?.guild_id && canManage(channel)),
            onPress: message => {
                api("patch", `/channels/${message.channel_id}/messages/${message.id}`, { flags: message.flags ^ SUPPRESS_EMBEDS })
                    .catch(() => showToast(t("Couldn't change the embeds"), findAssetId("CircleXIcon-primary")));
            },
        }));
    },
});
