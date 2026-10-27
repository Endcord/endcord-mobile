/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onSend, outsideCode } from "../hooks";
import { capitalizeSentences, splitList } from "../shared/compose";

export default definePlugin({
    id: "endcord.write-upper-case",
    name: "WriteUpperCase",
    description: tx("Changes the first Letter of each Sentence in Message Inputs to Uppercase"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        blockedWords: {
            type: "string",
            label: tx("Words to leave lowercase"),
            description: tx("Strings not to capitalise (separate with a comma)"),
            default: "http, https, ok",
        },
    },
    start({ store, cleanup }) {
        cleanup(onSend("write-upper-case", content => outsideCode(content, text => capitalizeSentences(text, splitList(store.blockedWords))), 10));
    },
});
