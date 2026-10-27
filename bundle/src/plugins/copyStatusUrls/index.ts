/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { addMessageAction, copy } from "../hooks";
import { choose } from "../ui/dialogs";

export default definePlugin({
    id: "endcord.copy-status-urls",
    name: "CopyStatusUrls",
    description: tx("Copy the links in the status of a message's author from the message menu"),
    icon: "LinkIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const urls = (userId: string): string[] => {
            const activities: any[] = getStore("PresenceStore")?.getActivities?.(userId) ?? [];
            return activities.flatMap(a => [a.url, ...(String(a.state ?? "").match(/https?:\/\/\S+/g) ?? [])]).filter(Boolean);
        };
        cleanup(addMessageAction({
            key: "copy-status-urls",
            icon: "LinkIcon",
            label: () => t("Copy Status URL"),
            visible: message => urls(message.author?.id).length > 0,
            onPress: message => {
                const list = urls(message.author.id);
                if (list.length === 1) copy(list[0]);
                else choose(t("Copy Status URL"), list.map(u => ({ label: u, value: u })), u => copy(u));
            },
        }));
    },
});
