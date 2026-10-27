/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { edit, loadedMessages, onSend } from "../hooks";

export default definePlugin({
    id: "endcord.message-burst",
    name: "MessageBurst",
    description: tx("Merges messages sent within a time period with your previous sent message if no one else sends a message before you."),
    tags: ["Chat"],
    settings: {
        timePeriod: { type: "number", label: tx("Burst length (seconds)"), description: tx("The duration of bursts (in seconds)."), default: 3, min: 1, max: 60 },
        useSpace: { type: "boolean", label: tx("Join with a space"), description: tx("Join the messages with a space instead of a new line"), default: false },
        shouldMergeWithAttachment: { type: "boolean", label: tx("Merge with attachments"), description: tx("Should the message be merged if the last message has an attachment?"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onSend("message-burst", (content, { channelId, editing, options }) => {
            if (editing || options?.messageReference || !content.trim()) return;
            const last = loadedMessages(channelId).at(-1);
            if (!last || last.author?.id !== currentUserId() || last.state !== "SENT") return;
            if (!store.shouldMergeWithAttachment && last.attachments?.length) return;
            const sentAt = typeof last.timestamp?.valueOf === "function" ? last.timestamp.valueOf() : Date.parse(last.timestamp);
            if (!(Date.now() - sentAt <= store.timePeriod * 1000)) return;
            const merged = `${last.content}${store.useSpace ? " " : "\n"}${content}`;
            if (merged.length > 2000) return;
            edit(channelId, last.id, merged);
            return null;
        }, 100));
    },
});
