/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import { botMessage, command, onMessageRow, redrawMessage, textNode } from "../hooks";
import { translate } from "../shared/lookup";

interface AutoTranslation {
    text: string;
    from: string;
}

export default definePlugin({
    id: "endcord.message-translate",
    name: "MessageTranslate",
    description: tx("Auto translate messages to your language with caching, per-channel toggles, and more options."),
    authors: [ENDCORD_AUTHOR],
    icon: "LanguageIcon",
    tags: ["Chat"],
    settings: {
        targetLanguage: { type: "string", label: tx("Translate to"), description: tx("A language code like en, tr, ru, es or fr. Leave empty for Discord's language."), default: "" },
        skipOwnMessages: { type: "boolean", label: tx("Skip my messages"), description: tx("Do not translate your own messages"), default: true },
        channels: { type: "string", label: tx("Channels"), description: tx("Channel IDs to translate, separated by commas. /autotranslate adds or removes the one you're in."), default: "" },
    },
    start({ store, cleanup }) {
        const cache = new Map<string, AutoTranslation | null>();
        const channels = () => new Set(store.channels.split(/[\s,]+/).filter(Boolean));
        const target = () => store.targetLanguage.trim() || (getStore("LocaleStore")?.locale ?? "en").split("-")[0];
        cleanup(
            onMessageRow("message-translate", (row, message) => {
                if (!channels().has(message.channel_id) || !message.content?.trim()) return;
                if (store.skipOwnMessages && message.author?.id === currentUserId()) return;
                const cached = cache.get(message.id);
                if (cached === undefined) {
                    cache.set(message.id, null);
                    translate(message.content, target())
                        .then(result => {
                            // Already in the right language
                            if (result.from === target() || result.text.trim() === message.content.trim()) return;
                            cache.set(message.id, result);
                            redrawMessage(message.channel_id, message.id);
                        })
                        .catch(() => cache.delete(message.id));
                    return;
                }
                if (cached && Array.isArray(row.content)) row.content = [...row.content, textNode(`\n🌐 ${cached.text}`)];
            }),
            command({
                name: "autotranslate",
                description: tx("Turn automatic translation on or off for this channel"),
                run: (_, ctx) => {
                    const list = channels();
                    const on = !list.delete(ctx.channel.id);
                    if (on) list.add(ctx.channel.id);
                    store.channels = [...list].join(", ");
                    botMessage(ctx.channel.id, on ? t("Messages here will be translated.") : t("Messages here won't be translated anymore."));
                },
            }),
        );
    },
});
