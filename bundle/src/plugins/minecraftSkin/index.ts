/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { enc, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.minecraft-skin",
    name: "MinecraftSkin",
    description: tx("Send a Minecraft player's skin with /mcskin"),
    authors: [ENDCORD_AUTHOR],
    icon: "ImageIcon",
    tags: ["Fun"],
    start: only({
        name: "mcskin",
        description: tx("Send a Minecraft player's skin"),
        options: [{ name: "player", description: tx("The player's name"), required: true }],
        run: ({ player }) => `https://mc-heads.net/body/${enc(String(player).trim())}/right`,
    }),
});
