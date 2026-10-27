/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore, subscribe } from "../common";
import { STATUS_OPTIONS, statusHold } from "../shared/activity";

/**
 * Whether you're playing a game on another device (a computer or console). Phones don't report games, and the
 * activities this phone shows are ones you set yourself, such as CustomRPC, so they don't count.
 */
function playingAnything(): boolean {
    const sessions = Object.values<any>(getStore("SessionsStore")?.getSessions?.() ?? {});
    const activities: any[] = [
        ...sessions.filter(s => s?.clientInfo?.client !== "mobile").flatMap(s => s?.activities ?? []),
        ...getStore("RunningGameStore")?.getRunningGames?.() ?? [],
    ];
    return activities.some(a => a && (a.type === 0 || a.type === undefined && a.name));
}

export default definePlugin({
    id: "endcord.auto-dnd-while-playing",
    name: "AutoDNDWhilePlaying",
    description: tx("Automatically updates your online status (online, idle, dnd) when launching games"),
    authors: [ENDCORD_AUTHOR],
    icon: "GameControllerIcon",
    tags: ["Notifications", "Utility"],
    settings: {
        status: { type: "select", label: tx("Status while playing"), description: tx("Your status goes back to what it was when you stop playing"), default: "dnd", options: STATUS_OPTIONS },
    },
    start({ store, cleanup }) {
        const hold = statusHold();
        const check = () => {
            if (playingAnything()) hold.set(store.status);
            else hold.release();
        };
        cleanup(
            () => hold.release(),
            subscribe("SESSIONS_REPLACE", check),
            subscribe("RUNNING_GAMES_CHANGE", check),
            subscribe("LOCAL_ACTIVITY_UPDATE", check),
        );
        check();
    },
});
