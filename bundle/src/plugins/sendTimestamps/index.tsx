/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addChatButton, getChatInputActionButton } from "../common";
import { copy, currentChannelId, generatedIcon, insertText, onSend } from "../hooks";
import { choose } from "../ui/dialogs";

export default definePlugin({
    id: "endcord.send-timestamps",
    name: "SendTimestamps",
    description: tx("Times written like `14:30` become timestamps everyone sees in their own time zone; a chat bar button inserts the current time"),
    icon: "ClockIcon",
    tags: ["Chat", "Utility"],
    settings: {
        replaceMessageContents: { type: "boolean", label: tx("Text shortcuts"), description: tx("Times written between backticks, like `14:30` or `2:30 PM`, become timestamps everyone sees in their own time zone"), default: true },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            description: tx("A button that inserts the current time as a timestamp"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        const parse = (time: string) => {
            const match = time.match(/^(\d{1,2}):(\d{2}) ?(AM|PM)?$/i);
            if (!match) return time;
            let hours = Number(match[1]);
            const minutes = Number(match[2]);
            if (match[3]) hours = hours % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
            if (hours > 23 || minutes > 59) return time;
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return `<t:${Math.floor(date.getTime() / 1000)}:t>`;
        };
        cleanup(
            onSend("send-timestamps", content => {
                if (!store.replaceMessageContents) return;
                return content.replace(/`(\d{1,2}:\d{2} ?(?:AM|PM)?)`/gi, (m, time) => {
                    const out = parse(time);
                    return out === time ? m : out;
                });
            }, 12),
            addChatButton({
                key: "send-timestamps",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const Button = getChatInputActionButton();
                    const Icon = generatedIcon("ClockIcon");
                    if (!Button || !Icon) return null;
                    return <Button
                        accessibilityLabel={t("Insert Timestamp")}
                        IconComponent={Icon}
                        onPress={() => choose(t("Insert Timestamp"), [
                            { label: t("Time"), value: "t" },
                            { label: t("Date and time"), value: "f" },
                            { label: t("Relative"), value: "R" },
                        ], format => {
                            const channelId = currentChannelId();
                            const stamp = `<t:${Math.floor(Date.now() / 1000)}:${format}> `;
                            if (!channelId || !insertText(channelId, stamp)) copy(stamp.trim());
                        })}
                    />;
                },
            }),
        );
    },
});
