/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's NoUnblockToJump: jumping to a message of someone you blocked or ignored, or of a likely spammer (from
 * search, a reply or a link), goes there instead of asking you to unblock them first. PC makes Discord's check pass
 * right before it looks at who wrote the message. The phone has the same check, validateJumpWithAlert; here, while it
 * runs, Discord's blocked, ignored and spam checks answer "no", so the rest of what it checks still applies and it
 * returns what it returns for anyone else. Blocking itself is unchanged everywhere else.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { getStore, moduleAt } from "../common";

const RELATIONSHIP_CHECKS = ["isBlocked", "isIgnored", "isBlockedOrIgnored", "isBlockedForMessage", "isIgnoredForMessage", "isBlockedOrIgnoredForMessage", "isSpam"];
const SPAM_CHECKS = ["isSpam", "isSpammer"];

export default definePlugin({
    id: "endcord.no-unblock-to-jump",
    name: "NoUnblockToJump",
    description: tx("Allows you to jump to messages of blocked or ignored users and likely spammers without unblocking them"),
    icon: "ArrowAngleRightUpIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const check = moduleAt("modules/messages/validateJumpWithAlert.tsx");
        const relationships = getStore("RelationshipStore");
        if (typeof check?.default !== "function") throw new Error("Discord's check before jumping to a message wasn't found");
        if (typeof relationships?.isBlockedForMessage !== "function") throw new Error("Discord's blocked users weren't found");
        const spam = moduleAt("modules/messages/isSpam.tsx");

        /** Inside Discord's check; nested in case it calls itself */
        let checking = 0;
        const neutralize = (holder: any, names: string[]) => {
            for (const name of names) {
                if (typeof holder?.[name] !== "function") continue;
                cleanup(instead(name, holder, function (this: any, args: any[], original: Function) {
                    return checking > 0 ? false : original.apply(this, args);
                }));
            }
        };
        neutralize(relationships, RELATIONSHIP_CHECKS);
        neutralize(spam, SPAM_CHECKS);

        cleanup(instead("default", check, function (this: any, args: any[], original: Function) {
            checking++;
            try {
                return original.apply(this, args);
            } finally {
                checking--;
            }
        }));
    },
});
