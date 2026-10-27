/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Things you keep for later: reminders, scheduled messages, bookmarks and tags. They're saved on the device and
 * survive restarts.
 *
 * What more than one of the RemindMe, MessageReminders, ScheduledMessages, Bookmarks and MessageTags plugins uses.
 */

import { t } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { botMessage, displayName, jumpTo, messageLink } from "../hooks";
import { createScheduler, type ScheduledItem } from "../scheduler";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

export const preview = (text: string, length = 80) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

export const when = (at: number) => `<t:${Math.floor(at / 1000)}:R>`;

interface Reminder extends ScheduledItem {
    channelId: string;
    text: string;
    messageId?: string;
}

/** Fires reminders as a toast and a message in the channel only you see */
function remind(reminder: Reminder, late: boolean) {
    const link = reminder.messageId ? `\n${messageLink(reminder.channelId, reminder.messageId)}` : "";
    const lateNote = late ? ` (${t("while Discord was closed")})` : "";
    botMessage(reminder.channelId, `⏰ **${t("Reminder")}**${lateNote}: ${reminder.text}${link}`);
    showToast(`⏰ ${preview(reminder.text, 60)}`, findAssetId("ClockIcon"));
}

export const reminders = createScheduler<Reminder>("REMIND_ME", remind);

export function RemindersList() {
    const items = reminders.useItems();
    return <LogList
        title={t("Upcoming Reminders")}
        empty={t("You have no reminders")}
        entries={items.map(r => ({
            key: r.id,
            label: preview(r.text),
            subLabel: new Date(r.at).toLocaleString(),
            icon: "ClockIcon",
            onPress: () => choose(preview(r.text, 40), [
                ...(r.messageId ? [{ label: t("Jump to Message"), value: "jump", icon: "ArrowAngleLeftUpIcon" }] : []),
                { label: t("Delete Reminder"), value: "delete", icon: "TrashIcon", danger: true },
            ], action => action === "jump" ? jumpTo(r.channelId, r.messageId!) : reminders.remove(r.id)),
        }))}
    />;
}

export interface Saved {
    id: string;
    channelId: string;
    author: string;
    content: string;
    at: number;
    tag?: string;
}

export function savedFrom(message: any): Saved {
    return {
        id: message.id,
        channelId: message.channel_id,
        author: displayName(message.author),
        content: message.content || (message.attachments?.length ? t("Sent an attachment") : ""),
        at: Date.now(),
    };
}
