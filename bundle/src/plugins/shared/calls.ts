/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * More of Endcord PC's voice channel plugins: what's going on in your call, and acting on everyone in it.
 *
 * What more than one of these plugins uses.
 */

import { findByProps } from "@metro";

import { getStore } from "../common";

export const myVoiceChannel = (): string | undefined => getStore("SelectedChannelStore")?.getVoiceChannelId?.() ?? undefined;

export const voiceActions = () => findByProps("selectVoiceChannel", "disconnect") ?? findByProps("selectVoiceChannel");

export const statesIn = (channelId?: string): Record<string, any> => channelId ? getStore("VoiceStateStore")?.getVoiceStatesForChannel?.(channelId) ?? {} : {};

export function permission(name: string, channel: any): boolean {
    const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions;
    return !!(permissions?.[name] && channel && getStore("PermissionStore")?.can?.(permissions[name], channel));
}

export const clock = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};
