/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { safeFetch } from "@lib/utils";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { copy, insertText } from "../hooks";
import { answer, enc, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.shorten-url",
    name: "ShortenURL",
    description: tx("Shorten a link with /shorten; the short link goes in the message box"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Utility"],
    start: only({
        name: "shorten",
        description: tx("Make a link shorter"),
        options: [{ name: "url", description: tx("The link"), required: true }],
        run: async ({ url }, ctx) => {
            const short = (await safeFetch(`https://is.gd/create.php?format=simple&url=${enc(String(url).trim())}`).then(r => r.text())).trim();
            if (!/^https?:\/\//.test(short)) return answer(ctx, short || t("That link couldn't be shortened."));
            if (!insertText(ctx.channel.id, short)) copy(short);
        },
    }),
});
