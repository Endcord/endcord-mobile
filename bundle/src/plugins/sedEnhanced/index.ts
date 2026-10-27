/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId } from "../common";
import { edit, loadedMessages, onSend } from "../hooks";

const SED = /^s([/|#@!$%])((?:\\.|(?!\1).)*)\1((?:\\.|(?!\1).)*)\1?([gimsuyr]*)$/;

export default definePlugin({
    id: "endcord.sed-enhanced",
    name: "SedEnhanced",
    description: tx("Edit your last message with s/find/replace/, with regular expressions, flags and other separators like s|a|b|g"),
    authors: [ENDCORD_AUTHOR],
    icon: "PencilIcon",
    tags: ["Chat"],
    settings: {
        regexByDefault: { type: "boolean", label: tx("Regular expressions by default"), description: tx("Inverts the `r` flag, so using the `r` flag enables non-regex mode, and omitting it uses regex mode."), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onSend("sed-enhanced", (content, { channelId, editing }) => {
            const match = !editing && content.trim().match(SED);
            if (!match) return;
            const [, , find, replace, flags] = match;
            const target = [...loadedMessages(channelId)].reverse().find(m => m.author?.id === currentUserId() && m.content);
            if (!target) return null;
            const regex = flags.includes("r") !== store.regexByDefault;
            let pattern: string | RegExp = find.replace(/\\(.)/g, regex ? "\\$1" : "$1");
            try {
                if (regex) pattern = new RegExp(pattern as string, flags.replace(/r/g, ""));
            } catch {
                showToast(t("That isn't a valid regular expression"), findAssetId("CircleXIcon-primary"));
                return null;
            }
            const replacement = replace.replace(/\\(.)/g, "$1");
            const updated = typeof pattern === "string"
                ? flags.includes("g") ? target.content.split(pattern).join(replacement) : target.content.replace(pattern, replacement)
                : target.content.replace(pattern, replacement);
            if (updated !== target.content) edit(channelId, target.id, updated);
            return null;
        }, -20));
    },
});
