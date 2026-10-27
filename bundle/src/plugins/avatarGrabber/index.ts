/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { botMessage, command, getUser } from "../hooks";
import { avatarUrl } from "../shared/lookup";

export default definePlugin({
    id: "endcord.avatar-grabber",
    name: "AvatarGrabber",
    description: tx("/avatar grabs the full-resolution avatar of any user (or yourself)."),
    icon: "ImageIcon",
    tags: ["Utility", "Media"],
    start({ cleanup }) {
        cleanup(command({
            name: "avatar",
            description: tx("Get a user's full-size avatar"),
            options: [{ name: "user", description: tx("Whose avatar (defaults to you)"), type: "user" }],
            run: ({ user: userId }, ctx) => {
                const user = getUser(userId ?? currentUserId());
                if (!user) {
                    botMessage(ctx.channel.id, t("Couldn't find that user."));
                    return;
                }
                return avatarUrl(user, 4096);
            },
        }));
    },
});
