/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { open, seal } from "../crypto";
import { addMessageAction, botMessage, command, onMessageRow, textNode } from "../hooks";
import { decryptionCache, INVISIBLE_MARKER, revealPrompt } from "../shared/messages";

// Invisible characters, built with fromCharCode so the source stays readable
const ZW = [0x200B, 0x200C, 0x200D, 0x2062].map(c => String.fromCharCode(c));

function hide(bytes: Uint8Array) {
    let out = INVISIBLE_MARKER;
    for (const b of bytes) out += ZW[b >> 6] + ZW[b >> 4 & 3] + ZW[b >> 2 & 3] + ZW[b & 3];
    return out;
}

function unhide(content: string): Uint8Array | undefined {
    const start = content.indexOf(INVISIBLE_MARKER);
    if (start === -1) return;
    const digits = [...content.slice(start + INVISIBLE_MARKER.length)].map(c => ZW.indexOf(c)).filter(d => d !== -1);
    const bytes = new Uint8Array(Math.floor(digits.length / 4));
    for (let i = 0; i < bytes.length; i++) bytes[i] = digits[i * 4] << 6 | digits[i * 4 + 1] << 4 | digits[i * 4 + 2] << 2 | digits[i * 4 + 3];
    return bytes;
}

export default definePlugin({
    id: "endcord.invisible-chat",
    name: "InvisibleChat",
    description: tx("Hide a secret, password-protected message inside an ordinary one with /invisible"),
    icon: "EyeSlashIcon",
    tags: ["Privacy", "Fun"],
    settings: {
        password: { type: "string", label: tx("Saved password"), description: tx("Hidden messages with it are shown under their message; leave empty to always ask"), default: "" },
    },
    start({ store, cleanup }) {
        const reveal = (content: string, password: string) => {
            const bytes = unhide(content);
            return bytes ? open(bytes, password) : undefined;
        };
        const shown = decryptionCache(reveal);
        cleanup(
            command({
                name: "invisible",
                description: tx("Send a message with a hidden secret inside"),
                options: [
                    { name: "cover", description: tx("The message everyone sees"), required: true },
                    { name: "secret", description: tx("The hidden message"), required: true },
                    { name: "password", description: tx("The password; leave it out to use your saved one") },
                ],
                run: ({ cover, secret, password }, ctx) => {
                    const key = String(password ?? store.password);
                    if (!key) {
                        botMessage(ctx.channel.id, t("Give a password or save one in the plugin's settings."));
                        return;
                    }
                    return `${cover}${hide(seal(String(secret), key))}`;
                },
            }),
            addMessageAction({
                key: "invisible-chat",
                icon: "EyeIcon",
                label: () => t("Reveal Hidden Message"),
                visible: message => (message.content ?? "").includes(INVISIBLE_MARKER),
                onPress: message => revealPrompt(t("Hidden Message"), password => reveal(message.content, password)),
            }),
            onMessageRow("invisible-chat", (row, message) => {
                if (!store.password || !Array.isArray(row.content) || !(message.content ?? "").includes(INVISIBLE_MARKER)) return;
                const text = shown(message, store.password);
                if (text !== undefined) row.content = [...row.content, textNode(`\n🔓 ${text}`)];
            }),
        );
    },
});
