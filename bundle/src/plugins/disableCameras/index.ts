/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Adapted from Endcord PC's DisableCameras. PC rewrites the voice states Discord reads so nobody's camera seems on.
 * The phone does it with Discord's own "turn off video" for each person in your call whose camera comes on, so
 * their video isn't loaded or shown, and turning someone's back on from their voice menu sticks for that call. When
 * you leave the call, or the plugin stops, the cameras it turned off are set back to what Discord had for them,
 * unless you changed them yourself.
 */

import { tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { currentUserId, getStore, moduleAt, subscribe } from "../common";
import { myVoiceChannel, statesIn } from "../shared/calls";
import { camerasToTurnOff, hasTracked, MAX_TRACKED, validTracked } from "./logic";

const CONTEXT = "default";
// Discord's video toggle state for a person whose video you turned off
const DISABLED = "DISABLED";

const saved = wrapSync(createStorage<{ off: Record<string, string>; }>(createMMKVBackend("ENDCORD_DISABLE_CAMERAS", { off: {} })));

const audioActions = () => moduleAt("actions/AudioActionCreators.tsx")?.default ?? findByProps("setDisableLocalVideo", "toggleLocalMute");

export default definePlugin({
    id: "endcord.disable-cameras",
    name: "DisableCameras",
    description: tx("Disables cameras in a call by default"),
    icon: "VideoIcon",
    tags: ["Appearance", "Customisation", "Media", "Privacy"],
    async start({ cleanup, logger }) {
        await awaitStorage(saved);
        const engine = getStore("MediaEngineStore");
        if (typeof engine?.isLocalVideoDisabled !== "function" || typeof engine.getVideoToggleState !== "function") {
            throw new Error("Discord's video settings weren't found");
        }
        if (typeof audioActions()?.setDisableLocalVideo !== "function") throw new Error("Discord's video actions weren't found");

        const handled = new Set<string>();
        let channelId: string | undefined;
        let refused = false;

        /** Puts back what Discord had for the cameras turned off here, for the ones still off */
        const restore = () => {
            // Nothing was turned off: nothing to put back, and the empty record isn't written again
            if (!hasTracked(saved.off)) return;
            const left: Record<string, string> = {};
            for (const [userId, previous] of Object.entries(validTracked(saved.off))) {
                try {
                    if (engine.isLocalVideoDisabled(userId, CONTEXT)) audioActions()?.setDisableLocalVideo?.(userId, previous, CONTEXT);
                } catch (e) {
                    // Kept, to be put back the next time
                    left[userId] = previous;
                    logger.error("couldn't turn a camera back on", e);
                }
            }
            saved.off = left;
        };

        const update = () => {
            const mine = myVoiceChannel();
            if (mine !== channelId) {
                // A new call, or none: what was turned off for the last one goes back
                if (channelId !== undefined || !mine) restore();
                handled.clear();
                channelId = mine;
            }
            if (!mine || refused) return;
            const off = validTracked(saved.off);
            // Written only when a camera was turned off: this runs for every voice state that changes in any of your
            // servers while you're in a call
            let changed = false;
            try {
                for (const userId of camerasToTurnOff(statesIn(mine), currentUserId(), handled)) {
                    handled.add(userId);
                    // Already off, which you did yourself: left to you
                    if (engine.isLocalVideoDisabled(userId, CONTEXT)) continue;
                    const previous = engine.getVideoToggleState(userId, CONTEXT);
                    audioActions()?.setDisableLocalVideo?.(userId, DISABLED, CONTEXT);
                    if (!engine.isLocalVideoDisabled(userId, CONTEXT)) {
                        // This Discord names the setting differently: nothing more is tried, rather than guessing
                        refused = true;
                        logger.warn("Discord didn't take the camera setting, so cameras stay on");
                        return;
                    }
                    if (Object.keys(off).length < MAX_TRACKED) {
                        off[userId] = typeof previous === "string" ? previous : "NONE";
                        changed = true;
                    }
                }
            } finally {
                // The cameras already turned off are kept to be put back, whatever stopped the loop
                if (changed) saved.off = off;
            }
        };

        // Discord's actions can't be dispatched while it handles another, so this runs right after. Nothing is
        // scheduled once the plugin has stopped, even when it was turned off while its storage loaded (its cleanups
        // then run as they're registered, below)
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const updateSoon = () => {
            if (timer || stopped) return;
            timer = setTimeout(() => {
                timer = undefined;
                if (stopped) return;
                try {
                    update();
                } catch (e) {
                    logger.error("couldn't check the cameras", e);
                }
            }, 50);
        };

        // Left over from a run that ended without stopping (Discord closed mid-call): put back unless still in that call
        if (!myVoiceChannel()) restore();
        else {
            channelId = myVoiceChannel();
            for (const userId of Object.keys(validTracked(saved.off))) handled.add(userId);
        }

        // Cleanups run last first: the listeners and the timer go, then the cameras are put back
        cleanup(
            restore,
            () => {
                stopped = true;
                clearTimeout(timer);
                timer = undefined;
            },
            subscribe("VOICE_STATE_UPDATES", () => updateSoon()),
            subscribe("VOICE_CHANNEL_SELECT", () => updateSoon()),
        );
        updateSoon();
    },
});
