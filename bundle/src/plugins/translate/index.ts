/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's Translate: messages from the message menu, what you send, and /translate, with the service you pick:
 * Google Translate, or as on PC DeepL (Free or Pro, with your API key) or Kagi (with your session token). As on PC,
 * a used-up DeepL quota falls back to Google Translate, and DeepL without a key goes back to Google.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { addMessageAction, command, onMessageRow, onSend, redrawMessage, textNode, toastError } from "../hooks";
import { translate as googleTranslate, Translation } from "../shared/lookup";
import { deeplTranslate, isHeaderSafe, kagiTranslate, languageLabel, QuotaError } from "./services";

/** Discord's language, the default target */
function appLanguage() {
    const locale: string = getStore("LocaleStore")?.locale ?? "en";
    return /^zh/.test(locale) ? locale : locale.split("-")[0];
}

const translations = new Map<string, Translation>();

const channelOf = new Map<string, string>();

const failure = () => findAssetId("CircleXIcon-primary");

const plugin = definePlugin({
    id: "endcord.translate",
    name: "Translate",
    description: tx("Translate messages from the message menu, translate what you send, or use /translate, with Google Translate, DeepL or Kagi; the text is sent to the service you pick"),
    icon: "LanguageIcon",
    tags: ["Chat", "Utility"],
    settings: {
        service: {
            type: "select",
            label: tx("Translation provider"),
            default: "google",
            options: [
                { label: tx("Google Translate"), value: "google" },
                { label: tx("DeepL Free — API key required"), value: "deepl" },
                { label: tx("DeepL Pro — API key required"), value: "deepl-pro" },
                { label: tx("Kagi Translate — API key required"), value: "kagi" },
            ],
        },
        deeplApiKey: { type: "string", label: tx("DeepL API Key"), description: tx("Your DeepL API key (from deepl.com/your-account)"), default: "", sensitive: true },
        kagiSession: { type: "string", label: tx("Kagi session token"), description: tx("Your Kagi session token (from kagi.com/settings?p=user_details)"), default: "", sensitive: true },
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
        let quotaWarned = false;

        /** With the service picked, falling back to Google Translate as PC does */
        async function translate(text: string, to: string): Promise<Translation> {
            const { service } = store;
            if (service === "deepl" || service === "deepl-pro") {
                const key = store.deeplApiKey.trim();
                if (!key || !isHeaderSafe(key)) {
                    showToast(t("DeepL API key is not set. Resetting to Google"), failure());
                    store.service = "google";
                    return googleTranslate(text, to);
                }
                try {
                    return await deeplTranslate(text, to, key, service === "deepl-pro");
                } catch (e) {
                    if (!(e instanceof QuotaError)) throw e;
                    if (!quotaWarned) {
                        quotaWarned = true;
                        showToast(t("Deepl API quota exceeded. Falling back to Google Translate"), failure());
                    }
                    return googleTranslate(text, to);
                }
            }
            if (service === "kagi") {
                const session = store.kagiSession.trim();
                if (!session || !isHeaderSafe(session)) throw new Error(t("Add your Kagi session token in Translate's settings first."));
                return kagiTranslate(text, to, session);
            }
            return googleTranslate(text, to);
        }

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
                row.content = [...row.content, textNode(`\n🌐 ${translation.text}\n(${t("translated from {language}", { language: languageLabel(translation.from) })})`)];
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
                // A part that couldn't be translated, or came back empty, goes as it was written
                const translated = await Promise.all(parts.map((part, i) => i % 2 || !part.trim()
                    ? part
                    : translate(part, to).then(r => r.text.trim() ? r.text : part, () => part)));
                return translated.join("");
            }, 40),
        );
    },
});

export default plugin;
