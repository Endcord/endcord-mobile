/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { addMessageAction, displayName } from "../hooks";
import { parseDuration } from "../scheduler";
import { preview, reminders, RemindersList } from "../shared/schedule";
import { choose, prompt } from "../ui/dialogs";

const REMIND_IN: Array<[string, number]> = [[tx("In 15 minutes"), 15 * 60_000], [tx("In 1 hour"), 3_600_000], [tx("In 3 hours"), 3 * 3_600_000], [tx("Tomorrow"), 24 * 3_600_000]];

export default definePlugin({
    id: "endcord.message-reminders",
    name: "MessageReminders",
    description: tx("Get reminded about a message later from the message menu. The reminder links right back to it."),
    icon: "ClockIcon",
    tags: ["Utility", "Notifications"],
    SettingsComponent: RemindersList,
    async start({ cleanup }) {
        await reminders.start();
        const schedule = (message: any, ms: number) => {
            const text = message.content ? `${displayName(message.author)}: ${preview(message.content, 120)}` : t("A message from {user}", { user: displayName(message.author) });
            const reminder = reminders.add({ at: Date.now() + ms, channelId: message.channel_id, messageId: message.id, text });
            showToast(t("Reminder set for {time}", { time: new Date(reminder.at).toLocaleString() }), findAssetId("ClockIcon"));
        };
        cleanup(
            () => reminders.stop(),
            addMessageAction({
                key: "message-reminders",
                icon: "ClockIcon",
                label: () => t("Remind Me"),
                onPress: message => choose(t("Remind Me"), [
                    ...REMIND_IN.map(([label, ms]) => ({ label: t(label), value: ms })),
                    { label: t("Custom…"), value: -1 },
                ], ms => {
                    if (ms > 0) return schedule(message, ms);
                    prompt({
                        title: t("Remind Me"),
                        description: t("When, like 10m, 2h, 1d or 1h30m"),
                        placeholder: "2h",
                        confirm: t("Remind Me"),
                        onSubmit: value => {
                            const custom = parseDuration(value);
                            if (!custom) throw new Error(t("Use something like 10m, 2h or 1d."));
                            schedule(message, custom);
                        },
                    });
                }),
            }),
        );
    },
});
