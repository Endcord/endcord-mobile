/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { botMessage, command, send } from "../hooks";
import { createScheduler, parseDuration, type ScheduledItem } from "../scheduler";
import { preview, when } from "../shared/schedule";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

interface ScheduledMessage extends ScheduledItem {
    channelId: string;
    content: string;
}

const scheduled = createScheduler<ScheduledMessage>("SCHEDULED_MESSAGES", (item, late) => {
    // Messages that came due while Discord was closed aren't sent without asking
    if (late) {
        botMessage(item.channelId, `📭 ${t("This scheduled message wasn't sent because Discord was closed:")}\n${item.content}`);
        return;
    }
    send(item.channelId, item.content);
    if (ScheduledMessages.store.showNotifications) showToast(t("Sent your scheduled message"), findAssetId("SendMessageIcon"));
});

function ScheduledList() {
    const items = scheduled.useItems();
    return <LogList
        title={t("Scheduled Messages")}
        empty={t("You have no scheduled messages")}
        entries={items.map(m => ({
            key: m.id,
            label: preview(m.content),
            subLabel: new Date(m.at).toLocaleString(),
            icon: "ClockIcon",
            onPress: () => choose(preview(m.content, 40), [
                { label: t("Send Now"), value: "send", icon: "SendMessageIcon" },
                { label: t("Cancel Message"), value: "cancel", icon: "TrashIcon", danger: true },
            ], action => {
                scheduled.remove(m.id);
                if (action === "send") send(m.channelId, m.content);
            }),
        }))}
    />;
}

const ScheduledMessages = definePlugin({
    id: "endcord.scheduled-messages",
    name: "ScheduledMessages",
    description: tx("Schedule messages to be sent at a specific time or after a delay."),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Chat", "Utility"],
    settings: {
        showNotifications: { type: "boolean", label: tx("Tell me when it's sent"), description: tx("Show toast notifications when messages are sent."), default: true },
    },
    SettingsComponent: ScheduledList,
    async start({ cleanup }) {
        await scheduled.start();
        cleanup(
            () => scheduled.stop(),
            command({
                name: "schedule",
                description: tx("Send a message later, while Discord is open"),
                options: [
                    { name: "in", description: tx("When, like 10m, 2h, 1d or 1h30m"), required: true },
                    { name: "message", description: tx("The message to send"), required: true },
                ],
                run: ({ in: delay, message }, ctx) => {
                    const ms = parseDuration(String(delay));
                    if (!ms || ms < 1000) {
                        botMessage(ctx.channel.id, t("Couldn't understand \"{time}\". Use something like 10m, 2h or 1d.", { time: delay }));
                        return;
                    }
                    const item = scheduled.add({ at: Date.now() + ms, channelId: ctx.channel.id, content: String(message) });
                    botMessage(ctx.channel.id, `🕒 ${t("Your message will be sent {when}. Discord has to be open then; see the plugin's settings to cancel it.", { when: when(item.at) })}`);
                },
            }),
        );
    },
});

export default ScheduledMessages;
