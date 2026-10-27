/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { api, command } from "../hooks";

export default definePlugin({
    id: "endcord.greet-sticker-picker",
    name: "GreetStickerPicker",
    description: tx("Wave to someone in a new DM or a new member with the sticker you pick, with /greet"),
    icon: "StickerIcon",
    tags: ["Fun", "Emotes"],
    settings: {
        sticker: { type: "string", label: tx("Sticker ID"), description: tx("The sticker /greet sends when you don't pick one"), default: "749054660769218631" },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "greet",
            description: tx("Wave hi with a sticker"),
            options: [{ name: "sticker", description: tx("A sticker ID; leave it out for your default") }],
            run: async ({ sticker }, ctx) => {
                const id = String(sticker ?? store.sticker).trim();
                await api("post", `/channels/${ctx.channel.id}/greet`, { sticker_ids: [id] })
                    .catch(() => api("post", `/channels/${ctx.channel.id}/messages`, { sticker_ids: [id] }));
            },
        }));
    },
});
