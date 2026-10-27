/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command, getChannel } from "../hooks";
import { translate } from "../shared/lookup";

export default definePlugin({
    id: "endcord.surface-translate",
    name: "SurfaceTranslate",
    description: tx("Translate a channel's name and topic with /translatechannel"),
    icon: "LanguageIcon",
    tags: ["Servers", "Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "translatechannel",
            description: tx("Translate this channel's name and topic (only you see it)"),
            run: async (_, ctx) => {
                const channel = getChannel(ctx.channel.id);
                const locale = (getStore("LocaleStore")?.locale ?? "en").split("-")[0];
                const name = channel?.name ? (await translate(channel.name.replace(/[-_]/g, " "), locale)).text : "";
                const topic = channel?.topic ? (await translate(channel.topic, locale)).text : "";
                botMessage(ctx.channel.id, [name && `**#${name}**`, topic || t("This channel has no topic.")].filter(Boolean).join("\n"));
            },
        }));
    },
});
