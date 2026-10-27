/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, displayName } from "../hooks";
import { accountsOf, failed, profileOf } from "../shared/people";
import { showText } from "../ui/dialogs";

export default definePlugin({
    id: "endcord.show-connections",
    name: "ShowConnections",
    description: tx("See the accounts a message's author has connected (GitHub, Steam, Spotify...) from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "show-connections",
            icon: "LinkIcon",
            label: () => t("Connections"),
            visible: message => !!message.author?.id && !message.author.bot,
            onPress: async message => {
                try {
                    const accounts = accountsOf(await profileOf(message.author.id));
                    showText(t("Connections of {user}", { user: displayName(message.author) }), accounts.length
                        ? accounts.map(a => `${a.type}: ${a.name}${a.verified ? " ✓" : ""}`).join("\n")
                        : t("No connected accounts are shown."));
                } catch (e) {
                    failed(e);
                }
            },
        }));
    },
});
