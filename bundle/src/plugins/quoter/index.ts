/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, copy, insertText } from "../hooks";

export default definePlugin({
    id: "endcord.quoter",
    name: "Quoter",
    description: tx("Quote a message into your message box with its author, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "quoter",
            icon: "ChatIcon",
            label: () => t("Quote"),
            visible: message => !!message.content?.trim(),
            onPress: message => {
                const quote = `${message.content.split("\n").map((l: string) => `> ${l}`).join("\n")}\n— <@${message.author.id}>\n`;
                if (!insertText(message.channel_id, quote)) copy(quote);
            },
        }));
    },
});
