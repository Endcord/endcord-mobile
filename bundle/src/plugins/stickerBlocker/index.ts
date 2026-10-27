/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { addMessageAction, hideLocally, onIncomingMessage } from "../hooks";
import { ids } from "../shared/filters";

export default definePlugin({
    id: "endcord.sticker-blocker",
    name: "StickerBlocker",
    description: tx("Allows you to block stickers from being displayed."),
    icon: "StickerIcon",
    tags: ["Chat", "Emotes"],
    settings: {
        showMessage: { type: "boolean", label: tx("Show a note"), description: tx("Whether to show a message detailing which id was blocked"), default: true },
        blockedStickers: { type: "string", label: tx("Blocked stickers"), description: tx("The list of blocked sticker IDs (don't edit unless you know what you're doing)"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(
            onIncomingMessage("sticker-blocker", message => {
                const stickers: any[] = message.sticker_items ?? message.stickers ?? [];
                const blocked = ids(store.blockedStickers);
                const kept = stickers.filter(s => !blocked.has(s.id));
                if (kept.length === stickers.length) return;
                const removed = stickers.filter(s => blocked.has(s.id));
                const note = store.showMessage ? `🚫 ${t("Blocked sticker: {name} ({id})", { name: removed[0].name, id: removed[0].id })}` : "";
                return {
                    ...message,
                    sticker_items: kept,
                    stickers: message.stickers ? kept : undefined,
                    content: message.content ? message.content : note,
                };
            }),
            addMessageAction({
                key: "sticker-blocker",
                icon: "StickerIcon",
                danger: true,
                label: () => t("Block Sticker"),
                visible: message => !!(message.stickerItems?.length || message.stickers?.length),
                onPress: (message, channel) => {
                    const stickers: any[] = message.stickerItems ?? message.stickers ?? [];
                    store.blockedStickers = [...ids(store.blockedStickers), ...stickers.map(s => s.id)].join(", ");
                    hideLocally(channel?.id ?? message.channel_id, message.id);
                    showToast(t("Sticker blocked"), findAssetId("StickerIcon"));
                },
            }),
        );
    },
});
