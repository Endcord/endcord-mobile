/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { safeFetch } from "@lib/utils";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { dispatchSoon } from "../common";
import { onIncomingMessage } from "../hooks";

const youtubeId = (url?: string) => url?.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/)?.[1];

export default definePlugin({
    id: "endcord.dearrow",
    name: "Dearrow",
    description: tx("Makes YouTube embed titles less sensationalist, powered by Dearrow"),
    authors: [ENDCORD_AUTHOR],
    icon: "VideoIcon",
    tags: ["Media"],
    start({ cleanup }) {
        // Video ID to its DeArrow title, or null when it has none
        const titles = new Map<string, string | null>();
        const retitle = (message: any) => {
            const embeds: any[] = message.embeds ?? [];
            let changed = false;
            const updated = embeds.map(e => {
                const title = titles.get(youtubeId(e.url)!);
                if (!title || e.title === title) return e;
                changed = true;
                return { ...e, title };
            });
            return changed ? { ...message, embeds: updated } : undefined;
        };
        const lookup = (message: any, videoId: string) => {
            titles.set(videoId, null);
            safeFetch(`https://sponsor.ajay.app/api/branding?videoID=${videoId}`)
                .then(r => r.json())
                .then(data => {
                    const best = (data?.titles ?? []).find((x: any) => !x.original && (x.locked || x.votes >= 0));
                    if (!best?.title) return;
                    titles.set(videoId, best.title.replace(/(^|\s)>(\S)/g, "$1$2"));
                    const updated = retitle(message);
                    if (updated) dispatchSoon({ type: "MESSAGE_UPDATE", message: { id: message.id, channel_id: message.channel_id, embeds: updated.embeds } });
                })
                .catch(() => { });
        };
        cleanup(onIncomingMessage("dearrow", message => {
            for (const embed of message.embeds ?? []) {
                const id = youtubeId(embed.url);
                if (id && !titles.has(id)) lookup(message, id);
            }
            return retitle(message);
        }));
    },
});
