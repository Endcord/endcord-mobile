/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction, copy, openUrl } from "../hooks";
import { pickOne } from "../shared/actions";

const STICKER_EXT: Record<number, string> = { 1: "png", 2: "png", 3: "json", 4: "gif" };

const stickerUrl = (s: any) => `https://media.discordapp.net/stickers/${s.id}.${STICKER_EXT[s.format_type ?? s.formatType] ?? "png"}`;

export default definePlugin({
    id: "endcord.copy-sticker-links",
    name: "CopyStickerLinks",
    description: tx("Adds the ability to copy & open Sticker links"),
    icon: "StickerIcon",
    tags: ["Emotes", "Utility"],
    start({ cleanup }) {
        const stickers = (message: any): any[] => message.stickerItems ?? message.stickers ?? [];
        cleanup(
            addMessageAction({
                key: "copy-sticker-link",
                icon: "StickerIcon",
                label: () => t("Copy Sticker Link"),
                visible: message => stickers(message).length > 0,
                onPress: message => pickOne(t("Copy Sticker Link"), stickers(message), s => s.name, s => copy(stickerUrl(s))),
            }),
            addMessageAction({
                key: "open-sticker-link",
                icon: "LinkExternalSmallIcon",
                label: () => t("Open Sticker Link"),
                visible: message => stickers(message).length > 0,
                onPress: message => pickOne(t("Open Sticker Link"), stickers(message), s => s.name, s => openUrl(stickerUrl(s))),
            }),
        );
    },
});
