/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { botMessage, command } from "../hooks";
import { guildChannels } from "../shared/navigation";

export default definePlugin({
    id: "endcord.voice-count",
    name: "VoiceCount",
    description: tx("See how many people are in each voice channel of a server with /voicecount"),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "voicecount",
            description: tx("How many people are in each voice channel here"),
            run: (_, ctx) => {
                const guildId = ctx.channel.guild_id;
                if (!guildId) return botMessage(ctx.channel.id, t("Use it in a server."));
                const voice = getStore("VoiceStateStore");
                const lines = guildChannels(guildId, "VOCAL")
                    .map(c => ({ c, count: Object.keys(voice?.getVoiceStatesForChannel?.(c.id) ?? {}).length }))
                    .filter(x => x.count > 0)
                    .sort((a, b) => b.count - a.count)
                    .map(x => `🔊 <#${x.c.id}> · ${x.count}`);
                botMessage(ctx.channel.id, lines.length ? lines.join("\n") : t("Nobody is in a voice channel here."));
            },
        }));
    },
});
