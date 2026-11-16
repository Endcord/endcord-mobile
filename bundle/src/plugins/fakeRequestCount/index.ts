/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's FakeRequestCount: Discord's friend request and message request badges show the numbers you choose.
 * As on PC only the numbers change, read from the same two counts Discord's badges ask for; the lists behind them stay
 * as they are, and nothing is sent to Discord.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin, onSettingChange } from "../api";
import { getStore } from "../common";

/** What a badge shows: the number asked for, held to PC's range, alone or added to the real one */
export function fakeCount(real: unknown, wanted: number, addToReal: boolean): number {
    const count = Math.max(0, Math.min(9999, Math.round(Number(wanted) || 0)));
    const actual = typeof real === "number" && Number.isFinite(real) ? real : 0;
    return addToReal ? actual + count : count;
}

export default definePlugin({
    id: "endcord.fake-request-count",
    name: "FakeRequestCount",
    description: tx("Shows as many friend and message requests as you like on Discord's badges. Only the numbers, only on your screen."),
    icon: "UserPlusIcon",
    tags: ["Fun"],
    settings: {
        friendRequests: { type: "number", label: tx("Friend requests"), description: tx("How many friend requests the Friends badge shows"), default: 3, min: 0, max: 9999 },
        messageRequests: { type: "number", label: tx("Message requests"), description: tx("How many message requests the Message Requests badge shows"), default: 2, min: 0, max: 9999 },
        addToReal: { type: "boolean", label: tx("Add to your real requests"), description: tx("Add these to your real requests instead of showing them alone"), default: false },
    },
    start({ store, cleanup }) {
        const relationships = getStore("RelationshipStore");
        const requests = getStore("MessageRequestStore");
        if (typeof relationships?.getPendingCount !== "function" && typeof requests?.getMessageRequestsCount !== "function") {
            throw new Error("Discord's request counts weren't found");
        }

        const count = (wanted: () => number) => function (this: any, args: any[], original: Function) {
            const real = original.apply(this, args);
            try {
                return fakeCount(real, wanted(), store.addToReal);
            } catch {
                return real;
            }
        };
        if (typeof relationships?.getPendingCount === "function") cleanup(instead("getPendingCount", relationships, count(() => store.friendRequests)));
        if (typeof requests?.getMessageRequestsCount === "function") cleanup(instead("getMessageRequestsCount", requests, count(() => store.messageRequests)));

        // The badges ask again when their stores change
        const refresh = () => {
            for (const s of [relationships, requests]) {
                try {
                    s?.emitChange?.();
                } catch { }
            }
        };
        cleanup(
            onSettingChange(store, refresh),
            // After the patches are off, so the badges show the real numbers again
            () => setTimeout(refresh, 0),
        );
        refresh();
    },
});
