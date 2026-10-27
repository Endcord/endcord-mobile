/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { MessageActions, onSend, toastError } from "../hooks";
import { splitMessage } from "../shared/chat";

export default definePlugin({
    id: "endcord.split-large-messages",
    name: "SplitLargeMessages",
    description: tx("Splits oversized messages into Discord-sized chunks before sending."),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Chat"],
    settings: {
        delay: { type: "number", label: tx("Pause between parts (ms)"), description: tx("So they arrive in order and don't trip the rate limit"), default: 800, min: 300, max: 5000 },
    },
    start({ store, cleanup }) {
        const following = new Set<string>();
        cleanup(onSend("split-large-messages", async (content, { channelId, editing }) => {
            if (editing || following.delete(content)) return;
            const limit = getStore("UserStore")?.getCurrentUser?.()?.premiumType === 2 ? 4000 : 2000;
            if (content.length <= limit) return;
            const [first, ...others] = splitMessage(content, limit);
            // The rest go out after the first, each through the chat box's path
            (async () => {
                for (const part of others) {
                    await new Promise(r => setTimeout(r, store.delay));
                    following.add(part);
                    await MessageActions()?.sendMessage(channelId, { content: part, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, undefined, {});
                }
            })().catch(toastError);
            showToast(t("Sending in {count} parts", { count: others.length + 1 }), findAssetId("ChatIcon"));
            return first;
        }, 97));
    },
});
