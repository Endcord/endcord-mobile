/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, subscribe } from "../common";
import { parseEmoji, react } from "../hooks";
import { ids } from "../shared/notify";

/** "keyword = emoji" lines */
function parseRules(text: string) {
    return text.split("\n").flatMap(line => {
        const index = line.lastIndexOf("=");
        if (index <= 0) return [];
        const keyword = line.slice(0, index).trim().toLowerCase();
        const emoji = parseEmoji(line.slice(index + 1));
        return keyword && emoji ? [{ keyword, emoji }] : [];
    });
}

export default definePlugin({
    id: "endcord.auto-react",
    name: "AutoReact",
    description: tx("Automatically react to messages containing specific keywords."),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Chat", "Emotes", "Fun"],
    settings: {
        rules: {
            type: "string",
            label: tx("Rules"),
            description: tx("One per line: keyword = emoji. Custom emojis are written as <:name:id>."),
            placeholder: "gg = 🎉",
            multiline: true,
            default: "",
        },
        reactToSelf: { type: "boolean", label: tx("React to my messages too"), description: tx("Also react to the messages you send"), default: false },
        channels: { type: "string", label: tx("Only in these channels"), description: tx("Channel IDs separated by commas; empty means everywhere"), default: "" },
    },
    start({ store, cleanup }) {
        // Reactions are queued so a busy chat doesn't hit Discord's rate limit; the queue only ticks while it has some
        const queue: Array<() => void> = [];
        let timer: ReturnType<typeof setInterval> | undefined;
        const enqueue = (fn: () => void) => {
            queue.push(fn);
            timer ??= setInterval(() => {
                queue.shift()?.();
                if (!queue.length) {
                    clearInterval(timer);
                    timer = undefined;
                }
            }, 400);
        };
        // Every message arrives here, so the rules and channels are parsed once per change, not once per message
        let rulesText: string | undefined, rules: ReturnType<typeof parseRules> = [];
        let channelsText: string | undefined, only = new Set<string>();
        cleanup(() => {
            clearInterval(timer);
            queue.length = 0;
        }, subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
            if (optimistic || !message?.content) return;
            if (!store.reactToSelf && message.author?.id === currentUserId()) return;
            if (channelsText !== store.channels) only = ids(channelsText = store.channels);
            if (only.size && !only.has(message.channel_id)) return;
            if (rulesText !== store.rules) rules = parseRules(rulesText = store.rules);
            const content = message.content.toLowerCase();
            for (const { keyword, emoji } of rules) {
                if (content.includes(keyword)) enqueue(() => react(message.channel_id, message.id, emoji));
            }
        }));
    },
});
