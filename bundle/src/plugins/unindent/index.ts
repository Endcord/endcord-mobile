/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onSend } from "../hooks";
import { unindentCodeBlocks } from "../shared/compose";

export default definePlugin({
    id: "endcord.unindent",
    name: "Unindent",
    description: tx("Trims leading indentation from codeblocks"),
    tags: ["Chat", "Utility"],
    start({ cleanup }) {
        cleanup(onSend("unindent", content => content.includes("```") ? unindentCodeBlocks(content) : undefined, 15));
    },
});
