/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, copy } from "../hooks";
import { showText } from "../ui/dialogs";

/** A message as JSON, without the parts that point back at stores */
function rawJson(message: any) {
    const seen = new WeakSet();
    return JSON.stringify(message, (key, value) => {
        if (key.startsWith("_")) return undefined;
        if (value && typeof value === "object") {
            if (seen.has(value)) return undefined;
            seen.add(value);
        }
        return value;
    }, 2);
}

export default definePlugin({
    id: "endcord.view-raw",
    name: "ViewRaw",
    description: tx("View and copy the raw content and data of any message"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaperIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(
            addMessageAction({
                key: "view-raw",
                icon: "PaperIcon",
                label: () => t("View Raw"),
                onPress: message => showText(t("View Raw"), message.content ? `${message.content}\n\n${rawJson(message)}` : rawJson(message)),
            }),
            addMessageAction({
                key: "copy-raw",
                icon: "CopyIcon",
                label: () => t("Copy Raw"),
                visible: message => !!message.content,
                onPress: message => copy(message.content),
            }),
        );
    },
});
