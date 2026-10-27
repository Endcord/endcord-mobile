/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { appendToTimestamp, onMessageRow } from "../hooks";

export default definePlugin({
    id: "endcord.word-count",
    name: "WordCount",
    description: tx("Shows the word count of messages next to their time"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        minimum: { type: "number", label: tx("Shortest message"), description: tx("Only count messages with at least this many words"), default: 1, min: 1, max: 1000 },
    },
    start({ store, cleanup }) {
        cleanup(onMessageRow("word-count", (row, message) => {
            const words = String(message.content ?? "").trim().split(/\s+/).filter(Boolean).length;
            if (words >= store.minimum) appendToTimestamp(row, ` · ${words === 1 ? t("1 word") : t("{count} words", { count: words })}`);
        }));
    },
});
