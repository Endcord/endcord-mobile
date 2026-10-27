/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";
import { findByName } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";

const SPAM_FLAG = 1 << 20;

export default definePlugin({
    id: "endcord.i-love-spam",
    name: "iLoveSpam",
    description: tx("Do not hide messages from 'likely spammers'"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    start({ cleanup }) {
        const MessageRecord = findByName("MessageRecord");
        if (typeof MessageRecord?.prototype?.hasFlag !== "function") throw new Error("Discord's message records weren't found");
        cleanup(instead("hasFlag", MessageRecord.prototype, function (this: any, args, original) {
            return args[0] === SPAM_FLAG ? false : original.apply(this, args);
        }));
    },
});
