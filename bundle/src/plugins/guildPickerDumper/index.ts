/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command, getGuild, share } from "../hooks";

export default definePlugin({
    id: "endcord.guild-picker-dumper",
    name: "GuildPickerDumper",
    description: tx("Share the links of every emoji and sticker of a server with /dumpemojis"),
    icon: "ReactionIcon",
    tags: ["Emotes", "Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "dumpemojis",
            description: tx("Share this server's emojis and stickers as a list of links"),
            run: async (_, ctx) => {
                const guildId = ctx.channel.guild_id;
                if (!guildId) {
                    botMessage(ctx.channel.id, t("This only works in a server."));
                    return;
                }
                const emojis: any[] = getStore("EmojiStore")?.getGuildEmoji?.(guildId) ?? [];
                const stickers: any[] = getStore("StickersStore")?.getStickersByGuildId?.(guildId) ?? [];
                const lines = [
                    ...emojis.map(e => `:${e.name}: https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}`),
                    ...stickers.map(s => `${s.name}: https://media.discordapp.net/stickers/${s.id}.${s.format_type === 4 ? "gif" : "png"}`),
                ];
                if (!lines.length) {
                    botMessage(ctx.channel.id, t("This server has no emojis or stickers."));
                    return;
                }
                await share(lines.join("\n"), getGuild(guildId)?.name);
            },
        }));
    },
});
