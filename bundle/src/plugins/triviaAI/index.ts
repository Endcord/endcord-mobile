/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's TriviaAI: "Answer With AI" in a message's long-press sheet asks the AI service you set up (any
 * OpenAI-style chat address, OpenRouter by default) about that message, and the answer goes in your message box, as a
 * reply, or in a message only you see. As on PC, the message, the ones before it if you ask for them, and their
 * pictures' links go to that service with your key; nothing goes there until you tap. Pictures sent inside the request
 * are only downloaded from Discord's own servers.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { isAddonUrl } from "@lib/utils/addonUrl";
import safeFetch, { readBytes, readText } from "@lib/utils/safeFetch";

import { definePlugin } from "../api";
import { currentUserId, getStore } from "../common";
import { toBase64 } from "../crypto";
import { addMessageAction, botMessage, copy, insertText, loadedMessages, send } from "../hooks";
import { answerOf, buildChat, type ChatMessage, hasContent, type ImagePart, isDiscordImage, previousMessages, systemPrompt } from "./payload";

const REQUEST_TIMEOUT = 60_000;
const MAX_REPLY_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Discord's limit for a message without Nitro */
const MAX_MESSAGE = 2000;

const failed = (text: string) => showToast(text, findAssetId("CircleXIcon-primary"));

export default definePlugin({
    id: "endcord.trivia-ai",
    name: "TriviaAI",
    description: tx("A plugin that helps you answer trivia questions using AI."),
    icon: "SparklesIcon",
    tags: ["Fun", "Utility"],
    settings: {
        apiKey: { type: "string", label: tx("API key"), description: tx("API Key."), placeholder: tx("Enter API Key here for your AI endpoint."), default: "", sensitive: true },
        model: { type: "string", label: tx("Model"), description: tx("AI Model to use."), placeholder: "google/gemini-3-flash-preview", default: "google/gemini-3-flash-preview" },
        systemPrompt: {
            type: "string",
            label: tx("Instructions"),
            description: tx("System Prompt for the AI. Placeholders: {current_user}, {current_time}"),
            default: "You are a helpful assistant who answers questions for the user in a concise and short way while using the least amount of words and punctuation.\nCurrent user: {current_user}\nCurrent time: {current_time}",
            multiline: true,
        },
        maxTokens: { type: "number", label: tx("Longest answer"), description: tx("Maximum number of tokens in the response."), default: 500, min: 1, max: 32768 },
        endpoint: { type: "string", label: tx("API address"), description: tx("OpenAI Compatible AI Endpoint."), placeholder: "https://openrouter.ai/api/v1/chat/completions", default: "https://openrouter.ai/api/v1/chat/completions", sensitive: true },
        context: { type: "number", label: tx("Earlier messages"), description: tx("Number of previous messages to include as context."), default: 0, min: 0, max: 50 },
        passMessageAuthorName: {
            type: "boolean",
            label: tx("Author names"),
            description: tx("Prepend the author's name to the message content when passing it to the AI. This can help the AI distinguish between different users in a conversation."),
            default: true,
        },
        treatSelfAsAssistant: {
            type: "boolean",
            label: tx("Your messages as the AI's"),
            description: tx("When enabled, your own messages will be treated as assistant messages in the context. This causes some models to start generating fanfic."),
            default: false,
        },
        mode: {
            type: "select",
            label: tx("Answers"),
            description: tx("How should answers be handled?"),
            default: "chatbar",
            options: [
                { label: tx("Auto Reply"), value: "autoreply" },
                { label: tx("Replace Chatbar Text"), value: "chatbar" },
                { label: tx("Clyde"), value: "bot" },
            ],
        },
        supportImages: { type: "boolean", label: tx("Pictures"), description: tx("Pass images to the AI for context (if any). This is not supported by all models."), default: true },
        sendImagesAsBase64: { type: "boolean", label: tx("Send pictures inside the request"), description: tx("Send images to the AI as base64."), default: false },
    },
    start({ store, cleanup, logger }) {
        const requests = new Set<AbortController>();
        let busy = false;

        async function inline(part: ImagePart, signal: AbortSignal): Promise<ImagePart | null> {
            const { url } = part.image_url;
            // Anything not on Discord's servers stays a link, for the AI to fetch
            if (!isDiscordImage(url)) return part;
            try {
                const res = await safeFetch(url, { signal }, REQUEST_TIMEOUT);
                const type = res.headers?.get?.("content-type") ?? "";
                if (!/^image\/[\w.+-]+$/i.test(type)) return null;
                const bytes = new Uint8Array(await readBytes(res, MAX_IMAGE_BYTES));
                return { type: "image_url", image_url: { url: `data:${type};base64,${toBase64(bytes)}` } };
            } catch (e) {
                logger.warn("A picture couldn't be sent inside the request", e);
                return null;
            }
        }

        async function ask(message: any, channel: any) {
            const key = store.apiKey.trim(), endpoint = store.endpoint.trim(), model = store.model.trim();
            if (!key || !endpoint || !model) return failed(t("TriviaAI: API settings are incomplete."));
            if (!isAddonUrl(endpoint)) return failed(t("The AI address must start with https://"));
            if (busy) return failed(t("Still waiting for the last answer."));
            busy = true;
            const controller = new AbortController();
            requests.add(controller);
            const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
            try {
                const channelId: string = message.channel_id ?? channel?.id;
                const earlier = previousMessages(loadedMessages(channelId), message, Math.min(50, Math.max(0, Math.round(store.context))));
                let chat: ChatMessage[] = buildChat([...earlier, message], message, {
                    myId: currentUserId(),
                    supportImages: store.supportImages,
                    passMessageAuthorName: store.passMessageAuthorName,
                    treatSelfAsAssistant: store.treatSelfAsAssistant,
                });
                if (!chat.length) return;
                if (store.supportImages && store.sendImagesAsBase64) {
                    chat = await Promise.all(chat.map(async m => typeof m.content === "string" ? m : {
                        ...m,
                        content: (await Promise.all(m.content.map(p => p.type === "image_url" ? inline(p, controller.signal) : p))).filter(p => p !== null),
                    }));
                }
                showToast(t("Thinking…"), findAssetId("SparklesIcon"));
                const me = getStore("UserStore")?.getCurrentUser?.();
                const res = await fetch(endpoint, {
                    method: "POST",
                    signal: controller.signal,
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: "system", content: systemPrompt(store.systemPrompt, me?.username ?? "Unknown User", new Date()) }, ...chat],
                        max_tokens: Math.round(store.maxTokens),
                    }),
                });
                const raw = await readText(res, MAX_REPLY_BYTES);
                let data: any;
                try {
                    data = JSON.parse(raw);
                } catch {
                    data = undefined;
                }
                if (!res.ok || data?.error) {
                    const error = typeof data?.error?.message === "string" ? data.error.message : raw.trim() || t("The request failed ({status})", { status: res.status });
                    return failed(error.slice(0, 200));
                }
                // Turned off while it was waiting
                if (!requests.has(controller)) return;
                const answer = answerOf(data);
                if (!answer) return failed(t("The AI didn't answer."));
                handle(message, channelId, answer);
            } catch (e) {
                if (controller.signal.aborted && !requests.has(controller)) return;
                logger.error("Error getting response from AI model", e);
                failed(t("Error getting response from AI model"));
            } finally {
                clearTimeout(timer);
                requests.delete(controller);
                busy = false;
            }
        }

        function handle(message: any, channelId: string, answer: string) {
            switch (store.mode) {
                case "autoreply":
                    // A reply that pings no one but the person asked
                    send(channelId, answer.slice(0, MAX_MESSAGE), {
                        messageReference: { channel_id: channelId, message_id: message.id },
                        allowedMentions: { parse: [], replied_user: true },
                    });
                    break;
                case "bot":
                    botMessage(channelId, answer.slice(0, 4000));
                    break;
                default:
                    if (!insertText(channelId, answer)) copy(answer, t("The answer was copied: the message box isn't open."));
            }
        }

        cleanup(
            addMessageAction({
                key: "trivia-ai",
                icon: "RobotIcon",
                label: () => t("Answer With AI"),
                visible: message => hasContent(message, store.supportImages),
                onPress: (message, channel) => void ask(message, channel),
            }),
            () => {
                for (const controller of [...requests]) {
                    requests.delete(controller);
                    controller.abort();
                }
            },
        );
    },
});
