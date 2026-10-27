/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { safeFetch } from "@lib/utils";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { fromBase64 } from "../crypto";
import { addMessageAction } from "../hooks";
import { extension, pick, zipEntries } from "../shared/media";
import { showText } from "../ui/dialogs";

const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

/** A file's bytes; React Native's fetch can't give an ArrayBuffer, so it goes through a data URL */
async function bytesOf(url: string): Promise<Uint8Array> {
    const blob = await safeFetch(url).then(r => r.blob());
    const data: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
    return fromBase64(data.slice(data.indexOf(",") + 1));
}

export default definePlugin({
    id: "endcord.zip-preview",
    name: "ZipPreview",
    description: tx("Previews ZIP contents inside file attachments."),
    authors: [ENDCORD_AUTHOR],
    icon: "FileIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        const zips = (m: any): any[] => (m.attachments ?? []).filter((a: any) => extension(a.filename) === "zip");
        cleanup(addMessageAction({
            key: "zip-preview",
            icon: "FileIcon",
            label: () => t("View ZIP Contents"),
            visible: m => zips(m).length > 0,
            onPress: m => pick(t("View ZIP Contents"), zips(m), async a => {
                if (a.size > 25 * 1048576) {
                    showToast(t("This file is too big to look into"), findAssetId("CircleXIcon-primary"));
                    return;
                }
                try {
                    const entries = zipEntries(await bytesOf(a.url));
                    showText(a.filename, entries.map(e => e.name.endsWith("/") ? `📁 ${e.name}` : `${e.name} · ${size(e.size)}`).join("\n") || t("The archive is empty."));
                } catch {
                    showToast(t("Couldn't open this ZIP file"), findAssetId("CircleXIcon-primary"));
                }
            }),
        }));
    },
});
