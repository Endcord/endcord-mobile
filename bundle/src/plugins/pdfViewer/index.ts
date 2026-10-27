/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, openUrl } from "../hooks";
import { extension, pick } from "../shared/media";

export default definePlugin({
    id: "endcord.pdf-viewer",
    name: "PdfViewer",
    description: tx("Preview PDF attachments without downloading them first, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "FileIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        const files = (m: any): any[] => (m.attachments ?? []).filter((a: any) => extension(a.filename) === "pdf");
        cleanup(addMessageAction({
            key: "pdf-viewer",
            icon: "FileIcon",
            label: () => t("View PDF"),
            visible: m => files(m).length > 0,
            onPress: m => pick(t("View PDF"), files(m), a => openUrl(`https://docs.google.com/viewer?url=${encodeURIComponent(a.url)}`)),
        }));
    },
});
