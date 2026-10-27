/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { onIncomingMessage } from "../hooks";

export default definePlugin({
    id: "endcord.content-warning",
    name: "ContentWarning",
    description: tx("Hides messages with trigger words you choose behind a spoiler you tap to reveal"),
    icon: "EyeSlashIcon",
    tags: ["Chat", "Privacy"],
    settings: {
        words: { type: "string", label: tx("Trigger words"), description: tx("Comma-separated words; messages with them are hidden behind a spoiler"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onIncomingMessage("content-warning", message => {
            const words = store.words.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
            const content: string = message.content ?? "";
            if (!words.length || !content || message.author?.id === currentUserId()) return;
            const lower = content.toLowerCase();
            const found = words.find(w => lower.includes(w));
            if (!found || /^\|\|[\s\S]*\|\|$/.test(content)) return;
            // Code blocks can't be inside a spoiler, so they're left as they are
            const hidden = content.split(/(```[\s\S]*?```)/g).map((part, i) => i % 2 || !part.trim() ? part : `||${part.replace(/\|\|/g, "")}||`).join("");
            return { ...message, content: `⚠️ ${t("Content warning: {word}", { word: found })}\n${hidden}` };
        }));
    },
});
