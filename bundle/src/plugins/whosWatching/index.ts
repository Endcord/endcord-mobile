/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command } from "../hooks";

export default definePlugin({
    id: "endcord.whos-watching",
    name: "WhosWatching",
    description: tx("See who is watching your stream with /viewers"),
    icon: "ScreenIcon",
    tags: ["Voice"],
    start({ cleanup }) {
        cleanup(command({
            name: "viewers",
            description: tx("Who is watching your stream"),
            run: (_, ctx) => {
                const streams = getStore("ApplicationStreamingStore");
                const stream = streams?.getCurrentUserActiveStream?.();
                if (!stream) return botMessage(ctx.channel.id, t("You aren't streaming."));
                const viewers: string[] = streams?.getViewerIds?.(stream) ?? [];
                botMessage(ctx.channel.id, viewers.length ? `👀 ${viewers.map(id => `<@${id}>`).join(", ")}` : t("Nobody is watching yet."));
            },
        }));
    },
});
