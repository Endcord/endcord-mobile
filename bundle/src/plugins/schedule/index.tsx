/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Things you keep for later: reminders, scheduled messages, bookmarks and tags. They're saved on the device and
 * survive restarts.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, appendToTimestamp, botMessage, command, displayName, jumpTo, messageLink, onMessageRow, redrawMessage, send } from "../hooks";
import { createScheduler, parseDuration, type ScheduledItem } from "../scheduler";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const preview = (text: string, length = 80) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};
const when = (at: number) => `<t:${Math.floor(at / 1000)}:R>`;

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

const reminders = createScheduler<Reminder>("REMIND_ME", remind);

function RemindersList() {
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

const RemindMe = definePlugin({
    id: "endcord.remind-me",
    name: "RemindMe",
    description: tx("/remindme <amount> <m|h|d> <text> pings you with a desktop notification later. Survives restarts."),
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

const REMIND_IN: Array<[string, number]> = [[tx("In 15 minutes"), 15 * 60_000], [tx("In 1 hour"), 3_600_000], [tx("In 3 hours"), 3 * 3_600_000], [tx("Tomorrow"), 24 * 3_600_000]];

const MessageReminders = definePlugin({
    id: "endcord.message-reminders",
    name: "MessageReminders",
    description: tx("Right-click a message to be reminded about it later. A notification brings you right back to it."),
    authors: [ENDCORD_AUTHOR],
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

interface Saved {
    id: string;
    channelId: string;
    author: string;
    content: string;
    at: number;
    tag?: string;
}

const bookmarks = wrapSync(createStorage<{ items: Saved[]; }>(createMMKVBackend("ENDCORD_BOOKMARKS", { items: [] })));
const bookmarked = () => Array.isArray(bookmarks.items) ? bookmarks.items : [];

function savedFrom(message: any): Saved {
    return {
        id: message.id,
        channelId: message.channel_id,
        author: displayName(message.author),
        content: message.content || (message.attachments?.length ? t("Sent an attachment") : ""),
        at: Date.now(),
    };
}

function BookmarkList() {
    useProxy(bookmarks);
    return <LogList
        title={t("Bookmarks")}
        empty={t("Long-press a message and choose Bookmark to save it here")}
        entries={bookmarked().map(b => ({
            key: b.id,
            label: `${b.author}: ${preview(b.content)}`,
            subLabel: new Date(b.at).toLocaleDateString(),
            icon: "BookmarkIcon",
            onPress: () => choose(preview(b.content, 40), [
                { label: t("Jump to Message"), value: "jump", icon: "ArrowAngleLeftUpIcon" },
                { label: t("Remove Bookmark"), value: "remove", icon: "TrashIcon", danger: true },
            ], action => {
                if (action === "jump") jumpTo(b.channelId, b.id);
                else bookmarks.items = bookmarked().filter(x => x.id !== b.id);
            }),
        }))}
    />;
}

const Bookmarks = definePlugin({
    id: "endcord.bookmarks",
    name: "Bookmarks",
    description: tx("Privately bookmark messages (beyond Discord's 50-pin limit) with a hover button, then view and jump to them from the Endcord Toolbox in the title bar."),
    authors: [ENDCORD_AUTHOR],
    icon: "BookmarkIcon",
    tags: ["Utility", "Chat"],
    SettingsComponent: BookmarkList,
    async start({ cleanup }) {
        await awaitStorage(bookmarks);
        cleanup(
            addMessageAction({
                key: "bookmarks",
                icon: "BookmarkIcon",
                label: message => bookmarked().some(b => b.id === message.id) ? t("Remove Bookmark") : t("Bookmark"),
                onPress: message => {
                    if (bookmarked().some(b => b.id === message.id)) {
                        bookmarks.items = bookmarked().filter(b => b.id !== message.id);
                        showToast(t("Bookmark removed"), findAssetId("BookmarkIcon"));
                    } else {
                        bookmarks.items = [savedFrom(message), ...bookmarked()];
                        showToast(t("Bookmarked. Find it in the Bookmarks plugin's settings."), findAssetId("BookmarkIcon"));
                    }
                },
            }),
            command({
                name: "bookmarks",
                description: tx("List your bookmarks (only you see it)"),
                run: (_, ctx) => {
                    const items = bookmarked().slice(0, 25);
                    botMessage(ctx.channel.id, items.length
                        ? items.map(b => `🔖 **${b.author}**: ${preview(b.content, 60)}\n${messageLink(b.channelId, b.id)}`).join("\n")
                        : t("Long-press a message and choose Bookmark to save it here"));
                },
            }),
        );
    },
});

const tagged = wrapSync(createStorage<{ items: Saved[]; }>(createMMKVBackend("ENDCORD_MESSAGE_TAGS", { items: [] })));
const taggedItems = () => Array.isArray(tagged.items) ? tagged.items : [];
const TAGS = [tx("TODO"), tx("Important"), tx("Read later"), tx("Idea"), tx("Question")];
// Choices that aren't tags
const CUSTOM = "endcord:custom";
const REMOVE = "endcord:remove";

function TagList() {
    useProxy(tagged);
    return <LogList
        title={t("Tagged Messages")}
        empty={t("Long-press a message and choose Tag Message to label it")}
        entries={taggedItems().map(m => ({
            key: m.id,
            label: `🏷 ${m.tag} · ${m.author}: ${preview(m.content, 60)}`,
            subLabel: new Date(m.at).toLocaleDateString(),
            onPress: () => choose(preview(m.content, 40), [
                { label: t("Jump to Message"), value: "jump", icon: "ArrowAngleLeftUpIcon" },
                { label: t("Remove Tag"), value: "remove", icon: "TrashIcon", danger: true },
            ], action => {
                if (action === "jump") jumpTo(m.channelId, m.id);
                else {
                    tagged.items = taggedItems().filter(x => x.id !== m.id);
                    redrawMessage(m.channelId, m.id);
                }
            }),
        }))}
    />;
}

const MessageTags = definePlugin({
    id: "endcord.message-tags",
    name: "MessageTags",
    description: tx("Tag messages with private local labels (TODO, Important, ...), see them as chips, and browse/jump to them from the Endcord Toolbox in the title bar."),
    authors: [ENDCORD_AUTHOR],
    icon: "TagIcon",
    tags: ["Utility", "Chat"],
    SettingsComponent: TagList,
    async start({ cleanup }) {
        await awaitStorage(tagged);
        const setTag = (message: any, tag: string | null) => {
            const rest = taggedItems().filter(m => m.id !== message.id);
            tagged.items = tag ? [{ ...savedFrom(message), tag }, ...rest] : rest;
            redrawMessage(message.channel_id, message.id);
        };
        cleanup(
            onMessageRow("message-tags", (row, message) => {
                const tag = taggedItems().find(m => m.id === message.id)?.tag;
                if (tag) appendToTimestamp(row, ` · 🏷 ${tag}`);
            }),
            addMessageAction({
                key: "message-tags",
                icon: "TagIcon",
                label: message => taggedItems().some(m => m.id === message.id) ? t("Change Tag") : t("Tag Message"),
                onPress: message => {
                    const current = taggedItems().find(m => m.id === message.id);
                    choose(t("Tag Message"), [
                        ...TAGS.map(tag => ({ label: t(tag), value: t(tag) })),
                        { label: t("Custom…"), value: CUSTOM },
                        ...(current ? [{ label: t("Remove Tag"), value: REMOVE, danger: true }] : []),
                    ], value => {
                        if (value === REMOVE) return setTag(message, null);
                        if (value !== CUSTOM) return setTag(message, value);
                        prompt({
                            title: t("Tag Message"),
                            placeholder: t("Tag name"),
                            confirm: t("Save"),
                            onSubmit: tag => setTag(message, tag.trim().slice(0, 24)),
                        });
                    });
                },
            }),
        );
    },
});

export default [RemindMe, MessageReminders, ScheduledMessages, Bookmarks, MessageTags];
