/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ChatGPTWriting: while it's switched on, the messages you send get a kaomoji or emoji that matches their
 * tone, and simple autocorrect. Nothing is sent anywhere: it's word lists, like on PC. PC's button can also go in the
 * title bar or the channel toolbar; a phone has the chat bar, beside the message box.
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addChatButton } from "../common";
import { onSend } from "../hooks";
import { chatButtonSetting, ToggleButton } from "../shared/compose";
import { rewrite } from "./writing";

const ChatGPTWriting = definePlugin({
    id: "endcord.chatgpt-writing",
    name: "ChatGPTWriting",
    description: tx("Enhance your messages with kaomoji, emoji, and autocorrect"),
    icon: "SparklesIcon",
    tags: ["Chat", "Utility"],
    settings: {
        isEnabled: { type: "boolean", label: tx("Enable ChatGPT Writing plugin"), description: tx("Also switched with the chat bar button"), default: false },
        useKaomoji: { type: "boolean", label: tx("Add a kaomoji at the end of your messages"), default: false },
        useEmoji: { type: "boolean", label: tx("Add an emoji at the end of your messages (matching message tone)"), default: false },
        autocorrect: { type: "boolean", label: tx("Automatically fix grammar and punctuation"), default: false },
        button: { ...chatButtonSetting, default: "left" },
    },
    start({ store, cleanup }) {
        cleanup(
            // After the text plugins' own rewrites (PolishWording is 11), before formatting and signatures
            onSend("chatgpt-writing", (content, { editing }) => {
                if (editing || !store.isEnabled) return;
                return rewrite(content, { kaomoji: store.useKaomoji, emoji: store.useEmoji, autocorrect: store.autocorrect });
            }, 12),
            addChatButton({
                key: "chatgpt-writing",
                side: () => store.button as "left" | "right" | "none",
                render: () => <ToggleButton
                    store={ChatGPTWriting.store}
                    field="isEnabled"
                    icon="SparklesIcon"
                    label={t("ChatGPT Writing")}
                    on={t("ChatGPT Writing is on")}
                    off={t("ChatGPT Writing is off")}
                />,
            }),
        );
    },
});

export default ChatGPTWriting;
