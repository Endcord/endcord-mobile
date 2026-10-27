/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { currentUserId, getStore } from "../common";
import { addMessageAction, onMessageRow } from "../hooks";
import { channelName } from "../shared/channels";

const voiceChannelOf = (userId?: string): string | undefined => userId ? getStore("VoiceStateStore")?.getVoiceStateForUser?.(userId)?.channelId ?? undefined : undefined;

export default definePlugin({
    id: "endcord.user-voice-show",
    name: "UserVoiceShow",
    description: tx("Shows an indicator on messages from people in a voice channel, and lets you join them from the message menu"),
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Chat"],
    start({ cleanup }) {
        cleanup(
            onMessageRow("user-voice-show", (row, message) => {
                if (voiceChannelOf(message.author?.id) && typeof row.timestamp === "string" && !row.timestamp.startsWith("🔊")) row.timestamp = `🔊 ${row.timestamp}`;
            }),
            addMessageAction({
                key: "user-voice-show",
                icon: "VoiceNormalIcon",
                label: message => t("Join Them in {channel}", { channel: channelName(voiceChannelOf(message.author?.id)!) }),
                visible: message => {
                    const channelId = voiceChannelOf(message.author?.id);
                    return !!channelId && message.author.id !== currentUserId() && channelId !== getStore("SelectedChannelStore")?.getVoiceChannelId?.();
                },
                onPress: message => findByProps("selectVoiceChannel")?.selectVoiceChannel?.(voiceChannelOf(message.author.id)),
            }),
        );
    },
});
