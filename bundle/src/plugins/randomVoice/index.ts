/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command } from "../hooks";
import { join, myVoiceChannel } from "../shared/voice";

export default definePlugin({
    id: "endcord.random-voice",
    name: "RandomVoice",
    description: tx("Join a random voice channel with /randomvoice"),
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Fun"],
    settings: {
        leaveEmpty: { type: "boolean", label: tx("Only channels with people"), description: tx("Only join voice channels someone is already in"), default: true },
        sameServer: { type: "boolean", label: tx("This server only"), description: tx("Only pick channels in the server you're in"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "randomvoice",
            description: tx("Join a random voice channel"),
            run: (_, ctx) => {
                const voiceStates = getStore("VoiceStateStore");
                const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions;
                const can = (channel: any) => !permissions || getStore("PermissionStore")?.can?.(permissions.CONNECT, channel);
                const guilds = store.sameServer && ctx.channel.guild_id ? [ctx.channel.guild_id] : Object.keys(getStore("GuildStore")?.getGuilds?.() ?? {});
                const candidates: string[] = [];
                for (const guildId of guilds) {
                    for (const { channel } of getStore("GuildChannelStore")?.getChannels?.(guildId)?.VOCAL ?? []) {
                        if (!channel || channel.id === myVoiceChannel() || !can(channel)) continue;
                        const people = Object.keys(voiceStates?.getVoiceStatesForChannel?.(channel.id) ?? {}).length;
                        if (store.leaveEmpty && !people) continue;
                        if (channel.userLimit && people >= channel.userLimit) continue;
                        candidates.push(channel.id);
                    }
                }
                if (!candidates.length) {
                    botMessage(ctx.channel.id, t("There's no voice channel to join."));
                    return;
                }
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                join(pick);
                botMessage(ctx.channel.id, t("Joining <#{channel}>…", { channel: pick }));
            },
        }));
    },
});
