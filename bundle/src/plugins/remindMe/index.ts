/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { botMessage, command } from "../hooks";
import { parseDuration } from "../scheduler";
import { reminders, RemindersList, when } from "../shared/schedule";

export default definePlugin({
    id: "endcord.remind-me",
    name: "RemindMe",
    description: tx("/remindme reminds you of something later with a notice in the chat. Survives restarts."),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Utility", "Notifications"],
    SettingsComponent: RemindersList,
    async start({ cleanup }) {
        await reminders.start();
        cleanup(
            () => reminders.stop(),
            command({
                name: "remindme",
                description: tx("Get a reminder later (only you see it)"),
                options: [
                    { name: "in", description: tx("When, like 10m, 2h, 1d or 1h30m"), required: true },
                    { name: "text", description: tx("What to remind you of"), required: true },
                ],
                run: ({ in: delay, text }, ctx) => {
                    const ms = parseDuration(String(delay));
                    if (!ms || ms < 1000) {
                        botMessage(ctx.channel.id, t("Couldn't understand \"{time}\". Use something like 10m, 2h or 1d.", { time: delay }));
                        return;
                    }
                    const reminder = reminders.add({ at: Date.now() + ms, channelId: ctx.channel.id, text: String(text) });
                    botMessage(ctx.channel.id, `⏰ ${t("I'll remind you {when}.", { when: when(reminder.at) })}`);
                },
            }),
        );
    },
});
