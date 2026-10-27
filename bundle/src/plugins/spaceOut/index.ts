/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { command } from "../hooks";
import { message } from "../shared/text";

export default definePlugin({
    id: "endcord.space-out",
    name: "SpaceOut",
    description: tx("/spaceout p u t s   s p a c e s   between every letter."),
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "spaceout",
            description: tx("Space out every letter"),
            options: [message()],
            run: ({ message }) => [...message].join(" "),
        }));
    },
});
