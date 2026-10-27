/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { addMessageAction, copy } from "../hooks";

export default definePlugin({
    id: "endcord.copy-profile-colors",
    name: "CopyProfileColors",
    description: tx("Copy the profile theme colors of a message's author from the message menu"),
    icon: "PaintPaletteIcon",
    tags: ["Utility", "Customisation"],
    start({ cleanup }) {
        const colorsOf = (userId: string): number[] | undefined => getStore("UserProfileStore")?.getUserProfile?.(userId)?.themeColors;
        const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
        cleanup(addMessageAction({
            key: "copy-profile-colors",
            icon: "PaintPaletteIcon",
            label: () => t("Copy Profile Colors"),
            visible: message => !!colorsOf(message.author?.id)?.length,
            onPress: message => {
                const [primary, accent] = colorsOf(message.author.id)!;
                copy(t("Primary: {primary}, Accent: {accent}", { primary: hex(primary), accent: hex(accent ?? primary) }));
            },
        }));
    },
});
