/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, openUrl } from "../hooks";

const MUSIC_LINK = /https?:\/\/(?:open\.spotify\.com|music\.apple\.com|music\.youtube\.com|(?:www\.)?deezer\.com|(?:listen\.)?tidal\.com|soundcloud\.com|music\.amazon\.[a-z.]+)\/\S+/i;

export default definePlugin({
    id: "endcord.song-link",
    name: "SongLink",
    description: tx("Open song links on your streaming service through song.link, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "MusicIcon",
    tags: ["Media"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "song-link",
            icon: "MusicIcon",
            label: () => t("Open in Other Services"),
            visible: message => MUSIC_LINK.test(message.content ?? ""),
            onPress: message => openUrl(`https://song.link/${message.content.match(MUSIC_LINK)![0]}`),
        }));
    },
});
