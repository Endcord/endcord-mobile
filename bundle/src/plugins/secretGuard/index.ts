/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's SecretGuard: stops a message that looks like it has a token, key, password or card number in it.
 * Sending it again within a minute sends it anyway.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { onSend } from "../hooks";
import { findSecret } from "./secrets";

interface Sent {
    channelId: string;
    content: string;
    at: number;
}

/** The text that was stopped last, so sending it again lets it through */
let stopped: Sent | null = null;
/** The last message let through, whose parts SplitLargeMessages sends one at a time right after */
let passed: Sent | null = null;
const SECOND_SEND_MS = 60_000;

/** A part of the message just let through: it was checked with the rest, and can't be sent again on its own */
const isPartOfPassed = (channelId: string, content: string, now: number) => !!passed && passed.channelId === channelId
    && now - passed.at < SECOND_SEND_MS && content.length < passed.content.length && passed.content.includes(content.trim());

export default definePlugin({
    id: "endcord.secret-guard",
    name: "SecretGuard",
    description: tx("Stops a message that looks like it has a token, key, password or card number in it. Send it again to send it anyway."),
    icon: "ShieldIcon",
    tags: ["Privacy", "Chat"],
    settings: {
        cards: { type: "boolean", label: tx("Also stop messages with a card number in them"), default: true },
        passwords: { type: "boolean", label: tx("Also stop messages that write out a password, like \"password: hunter2\""), default: true },
    },
    start({ store, cleanup }) {
        cleanup(
            onSend("secret-guard", (content, { channelId, editing }) => {
                // New messages, as on Endcord PC
                if (editing || !content) return;
                const now = Date.now();
                if (isPartOfPassed(channelId, content, now)) {
                    passed!.at = now;
                    return;
                }
                const found = findSecret(content, { cards: store.cards, passwords: store.passwords });
                if (!found) {
                    passed = { channelId, content, at: now };
                    return;
                }

                if (stopped && stopped.channelId === channelId && stopped.content === content && now - stopped.at < SECOND_SEND_MS) {
                    stopped = null;
                    passed = { channelId, content, at: now };
                    return;
                }
                stopped = { channelId, content, at: now };
                showToast(t("This message looks like it has {what} in it, so it wasn't sent. Send it again to send it anyway.", { what: t(found) }), findAssetId("ShieldIcon") ?? findAssetId("CircleXIcon-primary"));
                return null;
            }, -100),
            () => {
                stopped = null;
                passed = null;
            },
        );
    },
});
