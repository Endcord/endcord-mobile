/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { command, onMessageRow, redrawChannel, RowOrder, textNode } from "../hooks";
import { BUTTON_OPTIONS, chatButton } from "../shared/navigation";

export default definePlugin({
    id: "endcord.stream-proof",
    name: "StreamProof",
    description: tx("Hides messages and their images while you share your screen or record it. Toggle via chat bar button."),
    icon: "EyeSlashIcon",
    tags: ["Privacy"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "right", options: BUTTON_OPTIONS },
    },
    start({ store, cleanup }) {
        let on = false;
        const toggle = () => {
            on = !on;
            redrawChannel();
            showToast(on ? t("Messages are hidden") : t("Messages are shown again"), findAssetId(on ? "EyeSlashIcon" : "EyeIcon"));
        };
        cleanup(
            onMessageRow("stream-proof", row => {
                if (!on) return;
                if (Array.isArray(row.content)) row.content = [textNode("••••••")];
                for (const key of ["attachments", "embeds", "stickers", "gifts", "codedLinks"]) if (Array.isArray(row[key])) row[key] = [];
            }, RowOrder.HIDE),
            command({ name: "streamproof", description: tx("Hide or show messages"), run: toggle }),
            chatButton("stream-proof", store, "EyeSlashIcon", () => t("StreamProof"), toggle),
        );
    },
});
