/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { addMessageAction, command, onMessageRow, onSend, redrawMessage, textNode, toastError } from "../hooks";
import { translate, Translation } from "../shared/lookup";

/** Discord's language, the default target */
function appLanguage() {
    const locale: string = getStore("LocaleStore")?.locale ?? "en";
    return /^zh/.test(locale) ? locale : locale.split("-")[0];
}

const translations = new Map<string, Translation>();

const channelOf = new Map<string, string>();

export default definePlugin({
    id: "endcord.translate",
    name: "Translate",
    description: tx("Translate messages from the message menu, translate what you send, or use /translate (Google Translate)"),
    icon: "LanguageIcon",
    tags: ["Chat", "Utility"],
    settings: {
        receivedOutput: {
            type: "string",
            label: tx("Translate messages to"),
            description: tx("A language code like en, tr, ru, es or fr. Leave empty for Discord's language."),
            placeholder: "en",
            default: "",
        },
        autoTranslate: {
            type: "boolean",
            label: tx("Translate what you send"),
            description: tx("Your messages are translated before they're sent"),
            default: false,
        },
        sentOutput: {
            type: "string",
            label: tx("Translate your messages to"),
            description: tx("Used when \"Translate what you send\" is on"),
            placeholder: "en",
            default: "en",
        },
    },
    start({ store, cleanup }) {
        const target = () => store.receivedOutput.trim() || appLanguage();
        cleanup(
            () => {
                const shown = [...translations.keys()];
                translations.clear();
                for (const id of shown) {
                    const channelId = channelOf.get(id);
                    if (channelId) redrawMessage(channelId, id);
                }
            },
            onMessageRow("translate", (row, message) => {
                const translation = translations.get(message.id);
                if (!translation || !Array.isArray(row.content)) return;
                row.content = [...row.content, textNode(`\n🌐 ${translation.text}\n(${t("translated from {language}", { language: translation.from.toUpperCase() })})`)];
            }),
            addMessageAction({
                key: "translate",
                icon: "LanguageIcon",
                label: message => translations.has(message.id) ? t("Show Original") : t("Translate"),
                visible: message => !!message.content?.trim(),
                onPress: async (message, channel) => {
                    channelOf.set(message.id, channel?.id ?? message.channel_id);
                    if (translations.delete(message.id)) {
                        redrawMessage(message.channel_id, message.id);
                        return;
                    }
                    try {
                        translations.set(message.id, await translate(message.content, target()));
                        redrawMessage(message.channel_id, message.id);
                    } catch (e) {
                        toastError(e);
                    }
                },
            }),
            command({
                name: "translate",
                description: tx("Translate text and send it"),
                options: [
                    { name: "text", description: tx("What to translate"), required: true },
                    { name: "to", description: tx("Language code to translate to, like en or tr"), required: true },
                ],
                run: async ({ text, to }) => (await translate(text, String(to).trim().toLowerCase())).text,
            }),
            onSend("translate", async content => {
                if (!store.autoTranslate || !content.trim() || content.startsWith("/")) return;
                const to = store.sentOutput.trim() || "en";
                const parts = content.split(/(```[\s\S]*?```|`[^`\n]*`|<[@#:a][^>]*>|https?:\/\/\S+)/g);
                const translated = await Promise.all(parts.map((part, i) => i % 2 || !part.trim() ? part : translate(part, to).then(r => r.text).catch(() => part)));
                return translated.join("");
            }, 40),
        );
    },
});
