/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { safeFetch } from "@lib/utils";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { onMessageRow, redrawMessage } from "../hooks";

const PRONOUNS: Record<string, string> = { he: "he/him", she: "she/her", it: "it/its", they: "they/them", any: tx("any pronouns"), ask: tx("ask me"), avoid: tx("use my name"), other: tx("other pronouns") };

export default definePlugin({
    id: "endcord.pronoundb",
    name: "PronounDB",
    description: tx("Shows people's pronouns from PronounDB next to their messages"),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Chat", "Friends"],
    settings: {
        discordFirst: { type: "boolean", label: tx("Prefer Discord's pronouns"), description: tx("Use the pronouns in someone's Discord profile when they've set them"), default: true },
    },
    start({ store, cleanup }) {
        const cache = new Map<string, string | null>();
        const queue = new Map<string, Set<string>>();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const flush = async () => {
            timer = undefined;
            const batch = [...queue.entries()].slice(0, 50);
            for (const [id] of batch) queue.delete(id);
            try {
                const data = await safeFetch(`https://pronoundb.org/api/v2/lookup?platform=discord&ids=${batch.map(([id]) => id).join(",")}`).then(r => r.json());
                for (const [id, messages] of batch) {
                    const set: string[] = data?.[id]?.sets?.en ?? [];
                    cache.set(id, set.length ? set.length === 1 ? PRONOUNS[set[0]] ?? set[0] : set.join("/") : null);
                    for (const key of messages) {
                        const [channelId, messageId] = key.split(":");
                        redrawMessage(channelId, messageId);
                    }
                }
            } catch {
                for (const [id] of batch) cache.set(id, null);
            }
            if (queue.size) timer = setTimeout(flush, 2000);
        };
        cleanup(() => clearTimeout(timer), onMessageRow("pronoundb", (row, message) => {
            const id = message.author?.id;
            if (!id || message.author.bot || typeof row.timestamp !== "string") return;
            if (store.discordFirst && getStore("UserProfileStore")?.getUserProfile?.(id)?.pronouns) return;
            const pronouns = cache.get(id);
            if (pronouns === undefined) {
                queue.set(id, (queue.get(id) ?? new Set()).add(`${message.channel_id}:${message.id}`));
                timer ??= setTimeout(flush, 500);
                return;
            }
            if (pronouns && !row.timestamp.startsWith(t(pronouns))) row.timestamp = `${t(pronouns)} · ${row.timestamp}`;
        }));
    },
});
