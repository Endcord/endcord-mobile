/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, displayName, openUrl } from "../hooks";
import { avatarUrl } from "../shared/lookup";
import { profileOf } from "../shared/people";
import { choose } from "../ui/dialogs";

export default definePlugin({
    id: "endcord.profile-media",
    name: "ProfileMedia",
    description: tx("Open a message author's avatar and banner in full resolution from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ImageIcon",
    tags: ["Media", "Friends"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "profile-media",
            icon: "ImageIcon",
            label: () => t("Avatar and Banner"),
            visible: message => !!message.author?.id,
            onPress: async message => {
                const user = message.author;
                const choices = [{ label: t("Open Avatar"), value: avatarUrl(user, 4096), icon: "UserCircleIcon" }];
                try {
                    const profile = await profileOf(user.id);
                    const banner = profile?.banner ?? profile?.user?.banner ?? user.banner;
                    if (banner) choices.push({ label: t("Open Banner"), value: `https://cdn.discordapp.com/banners/${user.id}/${banner}.${banner.startsWith("a_") ? "gif" : "png"}?size=4096`, icon: "ImageIcon" });
                } catch { }
                choose(displayName(user), choices, openUrl);
            },
        }));
    },
});
