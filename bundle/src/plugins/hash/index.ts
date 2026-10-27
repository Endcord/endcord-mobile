/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { hex, sha256, utf8 } from "../crypto";
import { copy } from "../hooks";
import { answer, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.hash",
    name: "Hash",
    description: tx("Get the SHA-256 hash of a text with /sha256"),
    icon: "LockIcon",
    tags: ["Utility"],
    start: only({
        name: "sha256",
        description: tx("The SHA-256 hash of a text"),
        options: [{ name: "text", description: tx("The text"), required: true }],
        run: ({ text }, ctx) => {
            const digest = hex(sha256(utf8(String(text))));
            answer(ctx, `\`${digest}\``);
            copy(digest);
        },
    }),
});
