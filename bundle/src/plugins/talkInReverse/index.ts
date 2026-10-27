/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onSend } from "../hooks";

export default definePlugin({
    id: "endcord.talk-in-reverse",
    name: "TalkInReverse",
    description: tx("Reverses the message content before sending it."),
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(onSend("talk-in-reverse", content => [...content].reverse().join(""), 30));
    },
});
