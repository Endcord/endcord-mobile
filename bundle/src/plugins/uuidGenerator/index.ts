/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { hex } from "../crypto";
import { copy } from "../hooks";
import { answer, only, randomBytes } from "../shared/utility";

export default definePlugin({
    id: "endcord.uuid-generator",
    name: "UUIDGenerator",
    description: tx("Make a random UUID with /uuid and copy it"),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Utility"],
    start: only({
        name: "uuid",
        description: tx("Make a random UUID"),
        run: (_, ctx) => {
            const b = randomBytes(16);
            b[6] = b[6] & 0x0F | 0x40;
            b[8] = b[8] & 0x3F | 0x80;
            const h = hex(b);
            const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
            answer(ctx, `\`${uuid}\``);
            copy(uuid);
        },
    }),
});
