/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { currentUserId, subscribe } from "../common";
import { getChannel } from "../hooks";
import { myVoiceChannel, voiceActions } from "../shared/calls";

export default definePlugin({
    id: "endcord.anti-move-deco",
    name: "AntiMoveDeco",
    description: tx("Puts you back in your voice channel when someone moves or disconnects you"),
    icon: "ShieldIcon",
    tags: ["Voice"],
    settings: {
        moves: { type: "boolean", label: tx("When I'm moved"), description: tx("Go back when someone moves you to another channel"), default: true },
        disconnects: { type: "boolean", label: tx("When I'm disconnected"), description: tx("Rejoin when someone disconnects you"), default: true },
    },
    start({ store, cleanup }) {
        const actions = voiceActions();
        if (typeof actions?.selectVoiceChannel !== "function") throw new Error("Discord's voice actions weren't found");
        // The channel you chose yourself. Only your own joins, switches and leaves go through these two, so a move by
        // someone else (which Discord reports like any other) is never mistaken for your choice.
        let wanted = myVoiceChannel();
        // Moves back in the last minute: when something keeps moving you, this gives up instead of fighting it
        let recent: number[] = [];
        cleanup(
            before("selectVoiceChannel", actions, ([channelId]: any[]) => void (wanted = channelId ?? undefined)),
            typeof actions.disconnect === "function" ? before("disconnect", actions, () => void (wanted = undefined)) : undefined,
            subscribe("VOICE_STATE_UPDATES", ({ voiceStates }) => {
                const me = (voiceStates ?? []).find((s: any) => s.userId === currentUserId());
                if (!me || !wanted || me.channelId === wanted) return;
                if (me.channelId ? !store.moves : !store.disconnects) return;
                const now = Date.now();
                recent = recent.filter(at => now - at < 60_000);
                if (recent.length >= 3) {
                    wanted = undefined;
                    showToast(t("Stopped moving you back, since someone keeps moving you"), findAssetId("ShieldIcon"));
                    return;
                }
                recent.push(now);
                const back = wanted;
                setTimeout(() => {
                    // You went somewhere else yourself meanwhile
                    if (wanted !== back) return;
                    actions.selectVoiceChannel(back);
                    showToast(t("Moved back to {channel}", { channel: getChannel(back)?.name ?? "" }), findAssetId("ShieldIcon"));
                }, 400);
            }),
        );
    },
});
