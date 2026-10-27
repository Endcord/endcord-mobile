/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onSend } from "../hooks";

const INVISIBLE = /[\u200B-\u200D\u200E\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF\u00AD]/g;

export default definePlugin({
    id: "endcord.zero-width-sanitizer",
    name: "ZeroWidthSanitizer",
    description: tx("Removes invisible zero-width characters from messages to prevent fingerprinting and tracking"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Privacy"],
    settings: {
        sanitizeOutgoing: { type: "boolean", label: tx("Clean your messages"), description: tx("Sanitize outgoing messages (before sending)"), default: true },
        sanitizeEdits: { type: "boolean", label: tx("Clean your edits"), description: tx("Sanitize edited messages too"), default: true },
        showToastOnDetection: { type: "boolean", label: tx("Tell me when something was removed"), description: tx("Show a notification when invisible characters are removed"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onSend("zero-width-sanitizer", (content, { editing }) => {
            if (editing ? !store.sanitizeEdits : !store.sanitizeOutgoing) return;
            // A message InvisibleChat hid a secret in is sent as it is
            if (content.includes(String.fromCharCode(0x2063, 0x2063))) return;
            // Zero-width joiners hold emoji sequences (👨‍👩‍👧) together, so the ones after an emoji are kept
            const cleaned = content.replace(INVISIBLE, (c, i: number) => c === "\u200D" && i > 0 && content.charCodeAt(i - 1) >= 0x2000 ? c : "");
            if (cleaned !== content && store.showToastOnDetection) showToast(t("Removed invisible characters from your message"), findAssetId("ShieldIcon"));
            return cleaned;
        }, 90));
    },
});
