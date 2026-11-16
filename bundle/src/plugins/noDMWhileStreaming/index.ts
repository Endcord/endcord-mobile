/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Adapted from Endcord PC's NoDMWhileStreaming. While you share your screen: DMs (and group DMs if you choose) are
 * left out of the DM list, their messages reach Discord as if sent with @silent so it makes no in-app pop-up or sound
 * for them, and they're marked as read, as PC does so no unread badge shows them. PC also blocks desktop
 * notifications; on a phone the notifications Android shows come from Discord's servers, which plugins can't stop.
 * PC's debug logging isn't needed here.
 */

import { tx } from "@core/i18n";
import { FluxDispatcher } from "@metro/common";

import { definePlugin, onSettingChange } from "../api";
import { currentUserId, getStore, onAction, subscribe } from "../common";
import { getChannel } from "../hooks";
import { bySection } from "../shared/lists";
import { rewriteResult } from "../shared/navigation";
import { isHiddenType, silenced, withoutDms } from "./logic";

/** Whether you're sharing your screen (Go Live) right now */
function isStreaming(): boolean {
    const me = currentUserId();
    const streams = getStore("ApplicationStreamingStore");
    return !!getStore("MediaEngineStore")?.isScreenSharing?.()
        || !!streams?.getCurrentUserActiveStream?.()
        || !!(me && streams?.getActiveStreamForUser?.(me));
}

export default definePlugin({
    id: "endcord.no-dm-while-streaming",
    name: "NoDMWhileStreaming",
    description: tx("While you share your screen, hides DMs from your DM list, silences their in-app pop-ups and sounds, and marks them as read. Android's own notifications come from Discord's servers and still show."),
    icon: "ScreenIcon",
    tags: ["Appearance", "Utility", "Privacy"],
    settings: {
        hideGroups: { type: "boolean", label: tx("Hide Group DMs too while streaming"), default: false },
    },
    start({ store, cleanup, logger }) {
        const sortStore = getStore("PrivateChannelSortStore");
        const typeOf = (id: string) => getChannel(id)?.type;
        let streaming = isStreaming();
        // Discord 353's DM list is getSortedChannels, in sections; older ones had getSortedPrivateChannels
        const patches = ["getPrivateChannelIds", "getSortedChannels", "getSortedPrivateChannels"]
            .map(method => rewriteResult(sortStore, method, list => streaming ? bySection(list, section => withoutDms(section, store.hideGroups, typeOf)) : list))
            .filter(p => p !== undefined);
        if (!patches.length) throw new Error("Discord's DM list wasn't found");
        // Drawn again right after the change that started or ended the stream, outside Discord's handling of it
        let redrawTimer: ReturnType<typeof setTimeout> | undefined;
        const redraw = () => {
            if (redrawTimer) return;
            redrawTimer = setTimeout(() => {
                redrawTimer = undefined;
                patches.forEach(p => p.refresh());
            }, 0);
        };

        // Marked as read a moment later, once for each DM however many messages came: one request, not one a message
        const unacked = new Map<string, string>();
        let ackTimer: ReturnType<typeof setTimeout> | undefined;
        const ackSoon = () => {
            if (ackTimer) return;
            ackTimer = setTimeout(() => {
                ackTimer = undefined;
                const channels = [...unacked].map(([channelId, messageId]) => ({ channelId, messageId, readStateType: 0 }));
                unacked.clear();
                if (!channels.length) return;
                try {
                    FluxDispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels });
                } catch (e) {
                    logger.error("couldn't mark the DMs as read", e);
                }
            }, 1500);
        };

        const update = () => {
            const now = isStreaming();
            if (now === streaming) return;
            streaming = now;
            redraw();
        };
        const watched = [getStore("ApplicationStreamingStore"), getStore("MediaEngineStore")].filter(s => typeof s?.addChangeListener === "function");
        for (const s of watched) s.addChangeListener(update);

        const isHiddenMessage = (message: any) => {
            if (!message?.channel_id || message.author?.id === currentUserId()) return false;
            return isHiddenType(getChannel(message.channel_id)?.type, store.hideGroups);
        };

        cleanup(
            // Cleanups run last first: the list is drawn again once the patches are gone
            () => sortStore?.emitChange?.(),
            () => patches.forEach(p => p.unpatch()),
            () => watched.forEach(s => s.removeChangeListener(update)),
            () => clearTimeout(redrawTimer),
            () => clearTimeout(ackTimer),
            onSettingChange(store, key => {
                if (key === "hideGroups" && streaming) redraw();
            }),
            onAction<{ message?: any; }>("MESSAGE_CREATE", ({ message }) => {
                update();
                if (!streaming || !isHiddenMessage(message)) return;
                return { message: silenced(message) };
            }),
            subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
                if (!streaming || optimistic || !isHiddenMessage(message) || typeof message.id !== "string") return;
                unacked.set(message.channel_id, message.id);
                ackSoon();
            }),
        );
        if (streaming) redraw();
    },
});
