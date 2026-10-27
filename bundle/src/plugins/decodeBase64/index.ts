/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction } from "../hooks";
import { decodeBase64 } from "../shared/actions";
import { showText } from "../ui/dialogs";

const base64In = (content: string) => (content.match(/\b[A-Za-z0-9+/]{8,}={0,2}/g) ?? []).map(decodeBase64).filter((d): d is string => !!d && d.length >= 3);

export default definePlugin({
    id: "endcord.decode-base64",
    name: "DecodeBase64",
    description: tx("Decode base64 content of any message and copy the decoded content."),
    icon: "PaperIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "decode-base64",
            icon: "PaperIcon",
            label: () => t("Decode Base64"),
            visible: message => base64In(message.content ?? "").length > 0,
            onPress: message => showText(t("Decoded Base64"), base64In(message.content).join("\n\n")),
        }));
    },
});
