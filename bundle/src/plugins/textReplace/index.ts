/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onSend } from "../hooks";
import TextReplaceRules, { applyRules } from "./TextReplaceRules";

export default definePlugin({
    id: "endcord.text-replace",
    name: "TextReplace",
    description: tx("Replace text in your messages. You can find pre-made rules in the #textreplace-rules channel in Endcord's Server"),
    icon: "PencilIcon",
    tags: ["Chat", "Utility"],
    SettingsComponent: TextReplaceRules,
    start({ cleanup }) {
        cleanup(onSend("text-replace", content => applyRules(content), 0));
    },
});
