/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, copy } from "../hooks";
import { pickOne } from "../shared/actions";

const emojisIn = (content: string) => [...new Set(content.match(/<a?:\w+:\d+>/g) ?? [])];

export default definePlugin({
    id: "endcord.copy-emoji-markdown",
    name: "CopyEmojiMarkdown",
    description: tx("Allows you to copy emojis as formatted string (<:blobcatcozy:1026533070955872337>)"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Emotes"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "copy-emoji-markdown",
            icon: "ReactionIcon",
            label: () => t("Copy Emoji Markdown"),
            visible: message => emojisIn(message.content ?? "").length > 0,
            onPress: message => pickOne(t("Copy Emoji Markdown"), emojisIn(message.content), e => e.replace(/^<a?:(\w+):\d+>$/, ":$1:"), e => copy(e)),
        }));
    },
});
