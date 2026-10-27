/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { botMessage, command } from "../hooks";

export default definePlugin({
    id: "endcord.wiki-lookup",
    name: "WikiLookup",
    description: tx("/wiki pulls a short Wikipedia summary for anything (sent only to you)."),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "wiki",
            description: tx("Look up a Wikipedia summary"),
            options: [{ name: "message", description: tx("What to look up"), required: true }],
            run: async ({ message }, ctx) => {
                const query = String(message).trim();
                if (!query) return;
                let data: any;
                try {
                    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
                    if (!res.ok) {
                        botMessage(ctx.channel.id, t("No Wikipedia article found for **{query}**.", { query }));
                        return;
                    }
                    data = await res.json();
                } catch {
                    botMessage(ctx.channel.id, t("Couldn't reach Wikipedia right now."));
                    return;
                }
                if (data.type === "disambiguation" || !data.extract) {
                    botMessage(ctx.channel.id, t("**{query}** is ambiguous — try being more specific.", { query }));
                    return;
                }
                const url = data.content_urls?.mobile?.page ?? data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`;
                botMessage(ctx.channel.id, `📚 **${data.title}**\n${data.extract}\n<${url}>`);
            },
        }));
    },
});
