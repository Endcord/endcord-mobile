/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onSend } from "../hooks";

const EMBED_HOSTS: Array<[RegExp, string]> = [
    [/^https:\/\/(?:www\.|vt\.)?tiktok\.com/i, "https://www.tnktok.com"],
    [/^https:\/\/(?:www\.)?(?:x|twitter)\.com/i, "https://www.fxtwitter.com"],
    [/^https:\/\/(?:www\.)?instagram\.com/i, "https://www.kkinstagram.com"],
];

export default definePlugin({
    id: "endcord.embedded-urls",
    name: "EmbeddedURLs",
    description: tx("Turns plain social links into embeddable URLs so posts and videos are fully viewable in Discord instead of forcing users to open the external site."),
    icon: "LinkIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        cleanup(onSend("embedded-urls", content => content.replace(/https:\/\/[^\s<>]+/g, url => {
            for (const [host, replacement] of EMBED_HOSTS) if (host.test(url)) return url.replace(host, replacement);
            return url;
        }), 51));
    },
});
