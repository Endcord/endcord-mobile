/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId } from "../common";
import { onIncomingMessage } from "../hooks";
import { renderTables } from "../shared/channels";

export default definePlugin({
    id: "endcord.markdown-tables",
    name: "MarkdownTables",
    description: tx("Render GitHub-style markdown tables in Discord messages."),
    authors: [ENDCORD_AUTHOR],
    icon: "PaperIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(onIncomingMessage("markdown-tables", message => {
            const content: string = message.content ?? "";
            // Your own messages keep their text, which is what editing them starts from
            if (!content.includes("|") || !content.includes("-") || message.author?.id === currentUserId()) return;
            const rendered = renderTables(content);
            return rendered !== content ? { ...message, content: rendered } : undefined;
        }));
    },
});
