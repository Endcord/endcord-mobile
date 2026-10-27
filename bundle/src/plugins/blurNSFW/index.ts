/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getChannel, onIncomingMessage } from "../hooks";

export default definePlugin({
    id: "endcord.blur-nsfw",
    name: "BlurNSFW",
    description: tx("Hides attachments in age-restricted channels behind a spoiler until you tap them"),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeSlashIcon",
    tags: ["Media", "Privacy"],
    start({ cleanup }) {
        cleanup(onIncomingMessage("blur-nsfw", message => {
            const channel = getChannel(message.channel_id);
            const attachments: any[] = message.attachments ?? [];
            if (!channel?.nsfw || !attachments.length || attachments.every(a => a.filename?.startsWith("SPOILER_"))) return;
            // Discord shows files whose name starts with SPOILER_ blurred, until tapped
            return { ...message, attachments: attachments.map(a => a.filename?.startsWith("SPOILER_") ? a : { ...a, filename: `SPOILER_${a.filename}` }) };
        }));
    },
});
