/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Adapted from Endcord PC's OnePingPerDM. PC leaves the sound out of Discord's notification for a DM message that
 * isn't the first unread one; the phone app plays its message sound through one function while it's open, which is
 * patched the same way. The sound Android plays for a notification while Discord is closed comes from Discord's
 * servers, which plugins can't change.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { currentUserId, getStore, moduleAt, onAction } from "../common";
import { getChannel } from "../hooks";
import { messageIn, playsSound } from "./logic";

const SOUND_MODULE = "modules/notifications/native/playInAppMessageSound.tsx";

export default definePlugin({
    id: "endcord.one-ping-per-dm",
    name: "OnePingPerDM",
    description: tx("If unread messages are sent by a user in DMs multiple times, you'll only hear one ping while Discord is open. Read the messages to reset the limit."),
    icon: "BellSlashIcon",
    tags: ["Notifications", "Customisation"],
    settings: {
        channelToAffect: {
            type: "select",
            label: tx("Select the type of DM for the plugin to affect"),
            default: "both_dms",
            options: [
                { label: tx("Both"), value: "both_dms" },
                { label: tx("User DMs"), value: "user_dm" },
                { label: tx("Group DMs"), value: "group_dm" },
            ],
        },
        allowMentions: { type: "boolean", label: tx("Receive audio pings for @mentions"), default: false },
        allowEveryone: { type: "boolean", label: tx("Receive audio pings for @everyone and @here in group DMs"), default: false },
    },
    start({ store, cleanup }) {
        const sound = moduleAt(SOUND_MODULE);
        const original = sound?.playInAppMessageSound;
        if (typeof original !== "function") throw new Error("Discord's message sound wasn't found");

        // The message being handled, for when Discord's sound function isn't handed it
        let last: { message: any; at: number; } | undefined;
        cleanup(onAction<{ message?: any; }>("MESSAGE_CREATE", ({ message }) => {
            if (message) last = { message, at: Date.now() };
        }, { first: true }));

        const unpatch = instead("playInAppMessageSound", sound, (args, orig) => {
            const message = messageIn(args) ?? (last && Date.now() - last.at < 2000 ? last.message : undefined);
            if (!message) return orig(...args);
            const oldest = getStore("ReadStateStore")?.getOldestUnreadMessageId?.(message.channel_id);
            if (playsSound(message, getChannel(message.channel_id)?.type, store, currentUserId(), oldest)) return orig(...args);
        });
        cleanup(unpatch, () => void (last = undefined));
        if (sound.playInAppMessageSound === original) throw new Error("Discord's message sound can't be changed");
    },
});
