/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { api, botMessage, command, MAX_SHARE_LENGTH, share } from "../hooks";
import { sleep } from "../shared/tools";

export default definePlugin({
    id: "endcord.export-dm",
    name: "ExportDM",
    description: tx("Export a chat's messages, attachments, stickers and reactions as TXT, Markdown or JSON with /exportdm"),
    icon: "ShareIcon",
    tags: ["Utility", "Privacy"],
    settings: {
        format: {
            type: "select",
            label: tx("Format"),
            default: "txt",
            options: [{ label: "TXT", value: "txt" }, { label: "Markdown", value: "md" }, { label: "JSON", value: "json" }],
        },
        limit: { type: "number", label: tx("Messages"), description: tx("How many of the latest messages to export"), default: 500, min: 50, max: 5000 },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "exportdm",
            description: tx("Export the messages of this chat and share them"),
            run: async (_, ctx) => {
                botMessage(ctx.channel.id, t("Exporting…"));
                const messages: any[] = [];
                let before: string | undefined;
                while (messages.length < store.limit) {
                    const page: any[] = await api("get", `/channels/${ctx.channel.id}/messages?limit=100${before ? `&before=${before}` : ""}`);
                    if (!Array.isArray(page) || !page.length) break;
                    messages.push(...page);
                    before = page[page.length - 1].id;
                    if (page.length < 100) break;
                    await sleep(300);
                }
                messages.reverse();
                const name = (m: any) => m.author?.global_name ?? m.author?.username ?? "?";
                const extras = (m: any) => [
                    ...(m.attachments ?? []).map((a: any) => a.url),
                    ...(m.sticker_items ?? []).map((s: any) => `[${t("Sticker")}: ${s.name}]`),
                    ...(m.reactions ?? []).map((r: any) => `${r.emoji?.name} ×${r.count}`),
                ];
                const render = (list: any[]) => {
                    if (store.format === "json") return JSON.stringify(list);
                    if (store.format === "md") return list.map(m => `**${name(m)}** — ${new Date(m.timestamp).toLocaleString()}\n${[m.content, ...extras(m)].filter(Boolean).join("\n")}`).join("\n\n");
                    return list.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${name(m)}: ${[m.content, ...extras(m)].filter(Boolean).join(" ")}`).join("\n");
                };
                // The share sheet takes only so much text; the oldest messages are left out until it fits
                let shown = messages;
                let text = render(shown);
                while (text.length > MAX_SHARE_LENGTH && shown.length > 1) {
                    shown = shown.slice(Math.ceil(shown.length / 10));
                    text = render(shown);
                }
                if (shown.length < messages.length) botMessage(ctx.channel.id, t("That was too long to share at once, so the export has the latest {count} messages.", { count: shown.length }));
                await share(text, t("Export"));
            },
        }));
    },
});
