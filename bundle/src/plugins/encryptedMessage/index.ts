/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { fromBase64, open, seal, toBase64 } from "../crypto";
import { addMessageAction, botMessage, command, onMessageRow, textNode } from "../hooks";
import { decryptionCache, revealPrompt } from "../shared/messages";

const SEALED = /🔐 ([A-Za-z0-9+/]{16,}={0,2})/;

export default definePlugin({
    id: "endcord.encrypted-message",
    name: "EncryptedMessage",
    description: tx("Send messages encrypted with a password with /encrypt; only people with the password can read them"),
    authors: [ENDCORD_AUTHOR],
    icon: "LockIcon",
    tags: ["Privacy", "Chat"],
    settings: {
        password: { type: "string", label: tx("Saved password"), description: tx("Messages encrypted with it are shown decrypted under them; leave empty to always ask"), default: "" },
    },
    start({ store, cleanup }) {
        const decrypt = (content: string, password: string) => {
            const match = content.match(SEALED);
            return match ? open(fromBase64(match[1]), password) : undefined;
        };
        const shown = decryptionCache(decrypt);
        cleanup(
            command({
                name: "encrypt",
                description: tx("Send an encrypted message"),
                options: [
                    { name: "message", description: tx("What to encrypt"), required: true },
                    { name: "password", description: tx("The password; leave it out to use your saved one") },
                ],
                run: ({ message, password }, ctx) => {
                    const key = String(password ?? store.password);
                    if (!key) {
                        botMessage(ctx.channel.id, t("Give a password or save one in the plugin's settings."));
                        return;
                    }
                    return `🔐 ${toBase64(seal(String(message), key))}`;
                },
            }),
            addMessageAction({
                key: "encrypted-message",
                icon: "LockIcon",
                label: () => t("Decrypt"),
                visible: message => SEALED.test(message.content ?? ""),
                onPress: message => revealPrompt(t("Decrypted Message"), password => decrypt(message.content, password)),
            }),
            onMessageRow("encrypted-message", (row, message) => {
                if (!store.password || !Array.isArray(row.content) || !SEALED.test(message.content ?? "")) return;
                const text = shown(message, store.password);
                if (text !== undefined) row.content = [...row.content, textNode(`\n🔓 ${text}`)];
            }),
        );
    },
});
