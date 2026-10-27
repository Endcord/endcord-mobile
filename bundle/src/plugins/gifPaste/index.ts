/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { insertText, onSend } from "../hooks";

export default definePlugin({
    id: "endcord.gif-paste",
    name: "GifPaste",
    description: tx("Makes picking a gif in the gif picker insert a link into the chatbox instead of instantly sending it"),
    icon: "GifIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        cleanup(onSend("gif-paste", (content, { channelId, editing, options }) => {
            if (editing || options?.location !== "gif_reply") return;
            return insertText(channelId, `${content} `) ? null : undefined;
        }, -30));
    },
});
