/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction, openUrl } from "../hooks";
import { extension, pick } from "../shared/media";

const OFFICE = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"]);

export default definePlugin({
    id: "endcord.file-viewer",
    name: "FileViewer",
    description: tx("View Word, Excel and PowerPoint attachments without downloading them, from the message menu"),
    icon: "FileIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        const files = (m: any): any[] => (m.attachments ?? []).filter((a: any) => OFFICE.has(extension(a.filename)));
        cleanup(addMessageAction({
            key: "file-viewer",
            icon: "FileIcon",
            label: () => t("View File"),
            visible: m => files(m).length > 0,
            onPress: m => pick(t("View File"), files(m), a => openUrl(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(a.url)}`)),
        }));
    },
});
