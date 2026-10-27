/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction, openUrl } from "../hooks";

const IS_VOICE_MESSAGE = 1 << 13;

export default definePlugin({
    id: "endcord.voice-download",
    name: "VoiceDownload",
    description: tx("Download voice messages from the message menu"),
    icon: "DownloadIcon",
    tags: ["Voice", "Media"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "voice-download",
            icon: "DownloadIcon",
            label: () => t("Download Voice Message"),
            visible: message => !!(message.flags & IS_VOICE_MESSAGE) && !!message.attachments?.[0]?.url,
            onPress: message => openUrl(message.attachments[0].url),
        }));
    },
});
