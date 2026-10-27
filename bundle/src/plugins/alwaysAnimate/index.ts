/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { before } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onMessageRow } from "../hooks";

export default definePlugin({
    id: "endcord.always-animate",
    name: "AlwaysAnimate",
    description: tx("Animates anything that can be animated"),
    authors: [ENDCORD_AUTHOR],
    icon: "GifIcon",
    tags: ["Appearance", "Media"],
    start({ cleanup }) {
        const images = findByProps("getAvatarDecorationURL", "getUserAvatarURL") ?? findByProps("getUserAvatarURL");
        if (!images) throw new Error("Discord's image helpers weren't found");
        if (typeof images.getUserAvatarURL === "function") cleanup(before("getUserAvatarURL", images, args => void (args[1] = true)));
        if (typeof images.getAvatarDecorationURL === "function") cleanup(before("getAvatarDecorationURL", images, ([props]) => void (props && (props.canAnimate = true))));
        if (typeof images.getGuildMemberAvatarURLSimple === "function") cleanup(before("getGuildMemberAvatarURLSimple", images, ([props]) => void (props && (props.canAnimate = true))));
        if (typeof images.getGuildIconURL === "function") cleanup(before("getGuildIconURL", images, ([props]) => void (props && (props.canAnimate = true))));
        cleanup(onMessageRow("always-animate", row => {
            if (typeof row.avatarURL === "string" && row.avatarURL.includes("/a_")) row.avatarURL = row.avatarURL.replace(/\.(webp|png)/, ".gif");
        }));
    },
});
