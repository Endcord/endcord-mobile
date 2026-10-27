/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { before } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { extension } from "../shared/media";

const RENAMES: Record<string, string> = { jfif: "jpg", jpe: "jpg", pjpeg: "jpg", pjp: "jpg", jpeg: "jpg", m4v: "mp4", qt: "mov", tif: "tiff" };

export default definePlugin({
    id: "endcord.fix-file-extensions",
    name: "FixFileExtensions",
    description: tx("Fixes file extensions by renaming them to a compatible supported format if possible"),
    authors: [ENDCORD_AUTHOR],
    icon: "AttachmentIcon",
    tags: ["Media"],
    start({ cleanup }) {
        const module = findByProps("CloudUpload");
        if (typeof module?.CloudUpload !== "function") throw new Error("Discord's uploader wasn't found");
        cleanup(before("CloudUpload", module, ([upload]: any[]) => {
            const file = upload?.file ?? upload;
            const name: unknown = file?.filename ?? file?.name;
            if (typeof name !== "string") return;
            const fixed = RENAMES[extension(name)];
            if (!fixed) return;
            const renamed = name.replace(/\.[^.]+$/, `.${fixed}`);
            if (file.filename) file.filename = renamed;
            if (file.name) file.name = renamed;
        }));
    },
});
