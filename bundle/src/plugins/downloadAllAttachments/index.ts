/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { addMessageAction, openUrl } from "../hooks";

export default definePlugin({
    id: "endcord.download-all-attachments",
    name: "DownloadAllAttachments",
    description: tx("Download every attachment of a message at once from the message menu"),
    icon: "DownloadIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "download-all-attachments",
            icon: "DownloadIcon",
            label: () => t("Download All Attachments"),
            visible: message => (message.attachments?.length ?? 0) > 1,
            onPress: message => {
                // Android downloads each link the browser is given; they're opened one at a time so none is dropped
                (message.attachments as any[]).forEach((a, i) => setTimeout(() => openUrl(a.url), i * 1200));
                showToast(t("Downloading {count} attachments", { count: message.attachments.length }), findAssetId("DownloadIcon"));
            },
        }));
    },
});
