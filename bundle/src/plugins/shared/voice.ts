/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Voice channel plugins: staying in calls, following people and finding a channel to join.
 *
 * What more than one of the VoiceRejoin, FollowUser and RandomVoice plugins uses.
 */

import { findByProps } from "@metro";

import { getStore } from "../common";

export const voiceActions = () => findByProps("selectVoiceChannel", "disconnect") ?? findByProps("selectVoiceChannel");

export const myVoiceChannel = (): string | undefined => getStore("SelectedChannelStore")?.getVoiceChannelId?.() ?? undefined;

export function join(channelId: string) {
    const actions = voiceActions();
    if (!actions?.selectVoiceChannel) throw new Error("Discord's voice actions weren't found");
    actions.selectVoiceChannel(channelId);
}
