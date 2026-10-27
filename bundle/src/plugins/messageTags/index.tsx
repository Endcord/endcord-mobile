/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { addMessageAction, appendToTimestamp, jumpTo, onMessageRow, redrawMessage } from "../hooks";
import { preview, Saved, savedFrom } from "../shared/schedule";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

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

export default definePlugin({
    id: "endcord.message-tags",
    name: "MessageTags",
    description: tx("Tag messages with private labels (TODO, Important, ...) shown next to their time, and find them in the plugin's settings"),
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
