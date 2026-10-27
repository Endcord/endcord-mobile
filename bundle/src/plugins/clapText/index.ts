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
    id: "endcord.clap-text",
    name: "ClapText",
    description: tx("Adds /clap to 👏 put 👏 claps 👏 between 👏 your 👏 words."),
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "clap",
            description: tx("Put 👏 claps 👏 between 👏 words"),
            options: [message()],
            run: ({ message }) => message.trim().split(/\s+/).join(" 👏 "),
        }));
    },
});
