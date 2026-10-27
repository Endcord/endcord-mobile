/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { addMessageAction, botMessage, command, deleteMessage, loadedMessages } from "../hooks";
import { isMine } from "../shared/actions";

export default definePlugin({
    id: "endcord.quick-delete",
    name: "QuickDelete",
    description: tx("Delete your last message in a channel with /deletelast, or any of yours from the message menu without confirming"),
    icon: "TrashIcon",
    tags: ["Chat"],
    settings: {
        showConfirmToast: { type: "boolean", label: tx("Confirm with a toast"), description: tx("Show a toast after deleting."), default: true },
    },
    start({ store, cleanup }) {
        cleanup(
            command({
                name: "deletelast",
                description: tx("Delete your last message in this channel"),
                run: (_, ctx) => {
                    const last = [...loadedMessages(ctx.channel.id)].reverse().find(isMine);
                    if (!last) {
                        botMessage(ctx.channel.id, t("You have no messages loaded in this channel."));
                        return;
                    }
                    deleteMessage(ctx.channel.id, last.id);
                    if (store.showConfirmToast) showToast(t("Deleted your last message"), findAssetId("TrashIcon"));
                },
            }),
            addMessageAction({
                key: "quick-delete",
                icon: "TrashIcon",
                danger: true,
                label: () => t("Delete Without Confirming"),
                visible: isMine,
                onPress: message => {
                    deleteMessage(message.channel_id, message.id);
                    if (store.showConfirmToast) showToast(t("Message deleted"), findAssetId("TrashIcon"));
                },
            }),
        );
    },
});
