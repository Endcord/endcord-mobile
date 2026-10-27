/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { botMessage, command } from "../hooks";

export default definePlugin({
    id: "endcord.chatgpt",
    name: "ChatGPT",
    description: tx("Allows using ChatGPT directly in Discord with configurable settings"),
    icon: "SparklesIcon",
    tags: ["Utility"],
    settings: {
        apiKey: { type: "string", label: tx("API key"), description: tx("Your own key from platform.openai.com; it stays on this phone"), default: "", placeholder: "sk-…" },
        model: { type: "string", label: tx("Model"), default: "gpt-4o-mini" },
        baseUrl: { type: "string", label: tx("API address"), description: tx("For OpenAI-compatible services; leave it as it is for OpenAI"), default: "https://api.openai.com/v1" },
        system: { type: "string", label: tx("Instructions"), description: tx("How it should answer"), default: "Answer briefly. Discord markdown is supported.", multiline: true },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "chatgpt",
            description: tx("Ask ChatGPT something"),
            options: [
                { name: "prompt", description: tx("Your question"), required: true },
                { name: "send", description: tx("Send the answer to the chat instead of only showing it to you"), type: "boolean" },
            ],
            run: async ({ prompt, send }, ctx) => {
                if (!store.apiKey.trim()) return botMessage(ctx.channel.id, t("Add your API key in the ChatGPT plugin's settings first."));
                botMessage(ctx.channel.id, t("Thinking…"));
                const res = await fetch(`${store.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${store.apiKey.trim()}` },
                    body: JSON.stringify({
                        model: store.model.trim() || "gpt-4o-mini",
                        messages: [...store.system.trim() ? [{ role: "system", content: store.system }] : [], { role: "user", content: String(prompt) }],
                    }),
                });
                const data = await res.json().catch(() => undefined);
                if (!res.ok) return botMessage(ctx.channel.id, t("ChatGPT answered with an error: {error}", { error: data?.error?.message ?? res.status }));
                const text = String(data?.choices?.[0]?.message?.content ?? "").trim().slice(0, 2000);
                if (send) return text;
                botMessage(ctx.channel.id, text || "…");
            },
        }));
    },
});
