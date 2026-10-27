/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, copy } from "../hooks";
import { pickOne } from "../shared/actions";

const TEXT_FILE = /\.(txt|md|log|json|ya?ml|toml|ini|cfg|conf|csv|xml|html?|css|s?[cj]ss|[cm]?[jt]sx?|py|rb|go|rs|java|kt|kts|c|h|cpp|hpp|cs|php|lua|sh|bat|ps1|sql|gradle|properties|diff|patch)$/i;

export default definePlugin({
    id: "endcord.copy-file-contents",
    name: "CopyFileContents",
    description: tx("Copy the contents of text file attachments from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "CopyIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const files = (message: any): any[] => (message.attachments ?? []).filter((a: any) => /^text\//.test(a.content_type ?? "") || TEXT_FILE.test(a.filename ?? ""));
        cleanup(addMessageAction({
            key: "copy-file-contents",
            icon: "CopyIcon",
            label: () => t("Copy File Contents"),
            visible: message => files(message).length > 0,
            onPress: message => pickOne(t("Copy File Contents"), files(message), f => f.filename, async file => {
                if (file.size > 2_000_000) {
                    showToast(t("This file is too big to copy"), findAssetId("CircleXIcon-primary"));
                    return;
                }
                try {
                    const res = await fetch(file.url);
                    // An expired link answers with an error page, which isn't the file
                    if (!res.ok) throw new Error(String(res.status));
                    copy(await res.text());
                } catch {
                    showToast(t("Couldn't download the file"), findAssetId("CircleXIcon-primary"));
                }
            }),
        }));
    },
});
