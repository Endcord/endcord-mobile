/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { copy } from "../hooks";
import { answer, only, randomBytes } from "../shared/utility";

export default definePlugin({
    id: "endcord.password-generator",
    name: "PasswordGenerator",
    description: tx("Make a strong random password with /passwordgen; only you see it, and it is copied"),
    icon: "LockIcon",
    tags: ["Utility", "Privacy"],
    start: only({
        name: "passwordgen",
        description: tx("Make a random password"),
        options: [
            { name: "length", description: tx("How many characters (8 to 128)"), type: "integer" },
            { name: "symbols", description: tx("Include symbols"), type: "boolean" },
        ],
        run: ({ length, symbols }, ctx) => {
            const size = Math.min(Math.max(Number(length) || 20, 8), 128);
            const chars = `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789${symbols === false ? "" : "!@#$%^&*-_=+?"}`;
            // Rejection sampling, so every character is equally likely
            const out: string[] = [];
            while (out.length < size) {
                for (const b of randomBytes(size * 2)) {
                    if (b < 256 - 256 % chars.length) out.push(chars[b % chars.length]);
                    if (out.length === size) break;
                }
            }
            const password = out.join("");
            answer(ctx, `||\`${password}\`||`);
            copy(password, t("Password copied"));
        },
    }),
});
