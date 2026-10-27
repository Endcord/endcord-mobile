/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { currentUserId } from "../common";
import { api, botMessage, command, getChannel } from "../hooks";
import { myVoiceChannel, permission, statesIn } from "../shared/calls";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const VOICE_ACTIONS = ["disconnect", "mute", "unmute", "deafen", "undeafen", "move"] as const;

export default definePlugin({
    id: "endcord.voice-chat-utilities",
    name: "VoiceChatUtilities",
    description: tx("Disconnect, move, mute or deafen everyone in your voice channel at once with /voiceall"),
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Servers"],
    settings: {
        waitAfter: { type: "number", label: tx("Actions before a pause"), description: tx("Amount of API actions to perform before waiting (to avoid rate limits)"), default: 5, min: 1, max: 50 },
        waitSeconds: { type: "number", label: tx("Pause (seconds)"), description: tx("Time to wait between each action (in seconds)"), default: 2, min: 0, max: 30 },
    },
    start({ store, cleanup }) {
        let busy = false;
        cleanup(command({
            name: "voiceall",
            description: tx("Act on everyone in your voice channel"),
            options: [
                { name: "action", description: tx("What to do"), required: true, choices: VOICE_ACTIONS.map(a => ({ name: a, value: a })) },
                { name: "to", description: tx("The voice channel to move them to"), type: "channel" },
            ],
            run: async ({ action, to }, ctx) => {
                const mine = myVoiceChannel();
                const channel = getChannel(mine);
                if (!channel?.guild_id) {
                    botMessage(ctx.channel.id, t("Join a server voice channel first."));
                    return;
                }
                if (action === "move" && !to) {
                    botMessage(ctx.channel.id, t("Pick a voice channel to move them to."));
                    return;
                }
                if (busy) {
                    botMessage(ctx.channel.id, t("Still working on the last one."));
                    return;
                }
                const needed = action === "disconnect" || action === "move" ? "MOVE_MEMBERS" : action.includes("mute") ? "MUTE_MEMBERS" : "DEAFEN_MEMBERS";
                if (!permission(needed, channel)) {
                    botMessage(ctx.channel.id, t("You don't have permission to do that here."));
                    return;
                }
                busy = true;
                const users = Object.keys(statesIn(mine)).filter(id => id !== currentUserId());
                const body = {
                    disconnect: { channel_id: null }, move: { channel_id: to }, mute: { mute: true }, unmute: { mute: false },
                    deafen: { deaf: true }, undeafen: { deaf: false },
                }[action as typeof VOICE_ACTIONS[number]];
                let done = 0;
                try {
                    for (const [i, userId] of users.entries()) {
                        await api("patch", `/guilds/${channel.guild_id}/members/${userId}`, body).then(() => done++).catch(() => { });
                        if ((i + 1) % store.waitAfter === 0) await sleep(store.waitSeconds * 1000);
                    }
                } finally {
                    busy = false;
                }
                botMessage(ctx.channel.id, t("Done for {count} of {total} members.", { count: done, total: users.length }));
            },
        }));
    },
});
