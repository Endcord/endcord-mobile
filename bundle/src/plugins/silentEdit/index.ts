/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { onMessageRow } from "../hooks";

export default definePlugin({
    id: "endcord.silent-edit",
    name: "SilentEdit",
    description: tx("Hides the '(edited)' label on your own edited messages. The message stays — nothing is deleted or resent."),
    icon: "PencilIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(onMessageRow("silent-edit", (row, message) => {
            if (message.author?.id === currentUserId() && row.edited) row.edited = undefined;
        }));
    },
});
