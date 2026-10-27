/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { before } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin } from "../api";

export default definePlugin({
    id: "endcord.anonymise-file-names",
    name: "AnonymiseFileNames",
    description: tx("Anonymise uploaded file names"),
    icon: "AttachmentIcon",
    tags: ["Privacy", "Media"],
    settings: {
        method: {
            type: "select",
            label: tx("New file names"),
            default: "random",
            options: [
                { label: tx("Random characters"), value: "random" },
                { label: tx("Upload time"), value: "timestamp" },
                { label: tx("Fixed name"), value: "fixed" },
            ],
        },
        randomisedLength: { type: "number", label: tx("Random name length"), description: tx("How many characters random names have"), default: 7, min: 3, max: 64 },
        fixedName: { type: "string", label: tx("Fixed name"), description: tx("The name used when the fixed name is chosen"), default: "image" },
    },
    start({ store, cleanup }) {
        const module = findByProps("CloudUpload");
        if (typeof module?.CloudUpload !== "function") throw new Error("Discord's uploader wasn't found");
        const newName = () => {
            if (store.method === "timestamp") return String(Date.now());
            if (store.method === "fixed") return store.fixedName.trim() || "image";
            const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            return Array.from({ length: store.randomisedLength }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        };
        cleanup(before("CloudUpload", module, ([upload]: any[]) => {
            const file = upload?.file ?? upload;
            const name: unknown = file?.filename ?? file?.name;
            if (typeof name !== "string") return;
            const dot = name.lastIndexOf(".");
            const renamed = newName() + (dot > 0 ? name.slice(dot) : "");
            if (file.filename) file.filename = renamed;
            if (file.name) file.name = renamed;
        }));
    },
});
