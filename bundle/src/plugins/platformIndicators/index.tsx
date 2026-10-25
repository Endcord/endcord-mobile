/*
 * Endcord for Android
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { after } from "@lib/api/patcher";
import { findByName } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, subscribe } from "../common";

const MESSAGE_ROW = 1;
const ICONS: Record<string, string> = { desktop: "🖥️", mobile: "📱", web: "🌐", embedded: "🎮", vr: "🥽" };
const ORDER = ["desktop", "web", "mobile", "embedded", "vr"];

const plugin = definePlugin({
    id: "endcord.platform-indicators",
    name: "PlatformIndicators",
    description: tx("Shows which devices people are online on (desktop, web or mobile) next to their messages."),
    authors: [ENDCORD_AUTHOR],
    popular: 9,
    icon: "MobilePhoneIcon",
    settings: {
        messages: { type: "boolean", label: tx("Messages"), description: tx("Next to the time of each message"), default: true },
        self: { type: "boolean", label: tx("Your own messages"), description: tx("Show your own devices too"), default: false },
        offline: { type: "boolean", label: tx("Hide when offline"), description: tx("Show nothing for people who are offline or invisible"), default: true },
    },
    start({ store, cleanup }) {
        const RowManager = findByName("RowManager");
        if (typeof RowManager?.prototype?.generate !== "function") throw new Error("Discord's message rows weren't found");

        cleanup(after("generate", RowManager.prototype, ([args], row) => {
            try {
                const message = row?.type === MESSAGE_ROW ? row.message : undefined;
                const author = args?.message?.author;
                if (!message || !store.messages || !author?.id || author.bot) return;
                if (!store.self && author.id === currentUserId()) return;
                const icons = platformIcons(author.id);
                if (icons && typeof message.timestamp === "string" && !message.timestamp.includes(icons)) {
                    message.timestamp = `${message.timestamp}  ${icons}`;
                }
            } catch (e) {
                console.error("[Endcord] PlatformIndicators couldn't decorate a message", e);
            }
        }));

        // Presence changes don't regenerate rows; the next redraw of a message picks them up
        cleanup(subscribe("PRESENCE_UPDATES", () => cache.clear()));
    },
});

const cache = new Map<string, string>();

function platformIcons(userId: string): string {
    if (cache.has(userId)) return cache.get(userId)!;
    let statuses: Record<string, string> | undefined;
    if (userId === currentUserId()) {
        // Your own sessions: this phone plus any others Discord knows about
        const sessions = getStore("SessionsStore")?.getSessions?.() ?? {};
        statuses = { mobile: "online" };
        for (const session of Object.values<any>(sessions)) {
            const client = session?.clientInfo?.client;
            if (client && client in ICONS) statuses[client] = session.status ?? "online";
        }
    } else {
        statuses = getStore("PresenceStore")?.getClientStatus?.(userId)
            ?? getStore("PresenceStore")?.getState?.()?.clientStatuses?.[userId];
    }
    const icons = ORDER
        .filter(p => statuses?.[p] && (!plugin.store.offline || (statuses[p] !== "offline" && statuses[p] !== "invisible")))
        .map(p => ICONS[p])
        .join("");
    cache.set(userId, icons);
    return icons;
}

export default plugin;
