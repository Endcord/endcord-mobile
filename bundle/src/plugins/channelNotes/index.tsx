/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addChatButton, getChatInputActionButton, subscribe } from "../common";
import { botMessage, command, currentChannelId, generatedIcon } from "../hooks";
import { channelName, preview } from "../shared/channels";
import { prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const notes = wrapSync(createStorage<{ notes: Record<string, string>; }>(createMMKVBackend("ENDCORD_CHANNEL_NOTES", { notes: {} })));

function editNote(channelId: string) {
    prompt({
        title: t("Note for {channel}", { channel: channelName(channelId) }),
        description: t("Only you see it. Leave it empty to delete the note."),
        initial: notes.notes?.[channelId] ?? "",
        multiline: true,
        allowEmpty: true,
        onSubmit: value => {
            const all = { ...(notes.notes ?? {}) };
            if (value.trim()) all[channelId] = value.trim();
            else delete all[channelId];
            notes.notes = all;
        },
    });
}

function NotesPage() {
    useProxy(notes);
    return <LogList
        title={t("Channel Notes")}
        empty={t("Open a chat and use /note or the chat bar button to write one")}
        entries={Object.entries(notes.notes ?? {}).map(([id, text]) => ({ key: id, label: channelName(id), subLabel: preview(text, 120), onPress: () => editNote(id) }))}
    />;
}

export default definePlugin({
    id: "endcord.channel-notes",
    name: "ChannelNotes",
    description: tx("Keep private notes on any channel, DM or group chat: rules, who is who, things to remember. Notes stay on your device."),
    authors: [ENDCORD_AUTHOR],
    icon: "PencilIcon",
    tags: ["Utility"],
    settings: {
        showOnOpen: { type: "boolean", label: tx("Show when I open the chat"), description: tx("Shows a chat's note as a notice when you open it"), default: false },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    SettingsComponent: NotesPage,
    async start({ store, cleanup }) {
        await awaitStorage(notes);
        cleanup(
            command({
                name: "note",
                description: tx("Show or write this chat's private note"),
                options: [{ name: "text", description: tx("The new note; leave it out to see the current one") }],
                run: ({ text }, ctx) => {
                    if (text) {
                        notes.notes = { ...(notes.notes ?? {}), [ctx.channel.id]: String(text) };
                        botMessage(ctx.channel.id, `📝 ${t("Note saved.")}`);
                    } else {
                        const note = notes.notes?.[ctx.channel.id];
                        botMessage(ctx.channel.id, note ? `📝 ${note}` : t("This chat has no note yet."));
                    }
                },
            }),
            subscribe("CHANNEL_SELECT", ({ channelId }) => {
                const note = store.showOnOpen && channelId && notes.notes?.[channelId];
                if (note) showToast(`📝 ${preview(note, 100)}`, findAssetId("PencilIcon"));
            }),
            addChatButton({
                key: "channel-notes",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const Button = getChatInputActionButton();
                    const Icon = generatedIcon("PencilIcon");
                    if (!Button || !Icon) return null;
                    return <Button accessibilityLabel={t("Channel Note")} IconComponent={Icon} onPress={() => {
                        const id = currentChannelId();
                        if (id) editNote(id);
                    }} />;
                },
            }),
        );
    },
});
