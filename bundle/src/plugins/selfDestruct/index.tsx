/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addChatButton, currentUserId, subscribe } from "../common";
import { appendToTimestamp, deleteMessage, nativeColor, onMessageRow, onSend, redrawMessage } from "../hooks";
import { createScheduler, type ScheduledItem } from "../scheduler";
import { chatButtonSetting, ToggleButton } from "../shared/compose";

interface Doomed extends ScheduledItem {
    channelId: string;
}

// Saved, so a message still goes when its time comes even if Discord was closed in between
const doomed = createScheduler<Doomed>("SELF_DESTRUCT", item => void deleteMessage(item.channelId, item.id));

const SelfDestruct = definePlugin({
    id: "endcord.self-destruct",
    name: "SelfDestruct",
    description: tx("Sends messages that are automatically deleted after a configurable delay. Red timer visible on each message."),
    authors: [ENDCORD_AUTHOR],
    icon: "TimerIcon",
    tags: ["Chat", "Privacy"],
    settings: {
        active: { type: "boolean", label: tx("Self-destruct my messages"), description: tx("SelfDestruct active (toggle in chat bar)"), default: false },
        delay: { type: "number", label: tx("Delay (seconds)"), description: tx("Delay before deletion (seconds)"), default: 30, min: 3, max: 86400 },
        button: { ...chatButtonSetting, default: "left" },
    },
    async start({ store, cleanup }) {
        await doomed.start();
        // Messages sent while it's on, until the server sends them back with an ID
        let pending: Array<{ channelId: string; content: string; at: number; }> = [];
        const red = nativeColor("#F23F43");
        cleanup(
            () => doomed.stop(),
            onSend("self-destruct", (content, { channelId, editing }) => {
                if (editing || !store.active) return;
                pending = [...pending.filter(p => Date.now() - p.at < 60_000), { channelId, content, at: Date.now() }];
            }, 99),
            subscribe("MESSAGE_CREATE", ({ message }) => {
                if (!message || message.author?.id !== currentUserId()) return;
                const index = pending.findIndex(p => p.channelId === message.channel_id && p.content.trim() === String(message.content ?? "").trim());
                if (index === -1) return;
                pending.splice(index, 1);
                doomed.add({ id: message.id, channelId: message.channel_id, at: Date.now() + store.delay * 1000 });
                redrawMessage(message.channel_id, message.id);
            }),
            onMessageRow("self-destruct", (row, message) => {
                const at = doomed.list().find(d => d.id === message.id)?.at;
                if (!at) return;
                if (red !== undefined) row.timestampColor = red;
                appendToTimestamp(row, ` · 💣 ${new Date(at).toLocaleTimeString()}`);
            }),
            addChatButton({
                key: "self-destruct",
                side: () => store.button as "left" | "right" | "none",
                render: () => <ToggleButton store={SelfDestruct.store} field="active" icon="TimerIcon" slashWhenOn={false} label={t("Self-destruct my messages")} on={t("Your messages will self-destruct")} off={t("Self-destruct is off")} />,
            }),
        );
    },
});

export default SelfDestruct;
