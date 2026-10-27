/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, displayName } from "../hooks";
import { showText } from "../ui/dialogs";

export default definePlugin({
    id: "endcord.review-db",
    name: "ReviewDB",
    description: tx("Read the ReviewDB reviews of a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "StarIcon",
    tags: ["Friends", "Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "review-db",
            icon: "StarIcon",
            label: () => t("View Reviews"),
            visible: message => !!message.author?.id && !message.author.bot,
            onPress: async message => {
                try {
                    const data = await fetch(`https://manti.vendicated.dev/api/reviewdb/users/${message.author.id}/reviews?flags=0&offset=0`).then(r => r.json());
                    const reviews: any[] = (data?.reviews ?? []).filter((r: any) => r?.comment && r.type !== 3);
                    showText(t("Reviews of {user}", { user: displayName(message.author) }), reviews.length
                        ? reviews.slice(0, 50).map(r => `${r.sender?.username ?? "?"} · ${new Date(r.timestamp * 1000).toLocaleDateString()}\n${r.comment}`).join("\n\n")
                        : t("Nobody has reviewed this user yet."));
                } catch {
                    showToast(t("Couldn't reach ReviewDB"), findAssetId("CircleXIcon-primary"));
                }
            },
        }));
    },
});
