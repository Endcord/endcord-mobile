/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore, subscribe } from "../common";
import { botMessage, command } from "../hooks";

function voiceServerInfo() {
    const rtc = getStore("RTCConnectionStore");
    const host = rtc?.getHostname?.();
    if (!host) return undefined;
    const ping = rtc?.getAveragePing?.() ?? rtc?.getLastPing?.();
    return { host, ping: typeof ping === "number" ? Math.round(ping) : undefined };
}

export default definePlugin({
    id: "endcord.voice-server-info",
    name: "VoiceServerInfo",
    description: tx("Shows the Discord voice server you're connected to and its ping"),
    authors: [ENDCORD_AUTHOR],
    icon: "ServerIcon",
    tags: ["Voice", "Utility"],
    settings: {
        notifyOnConnect: { type: "boolean", label: tx("Tell me on connect"), description: tx("Show the voice relay address and location after connecting."), default: false },
    },
    start({ store, cleanup }) {
        const describe = () => {
            const info = voiceServerInfo();
            return info ? `${info.host}${info.ping != null ? ` · ${info.ping} ms` : ""}` : undefined;
        };
        cleanup(
            subscribe("RTC_CONNECTION_STATE", ({ state }) => {
                if (store.notifyOnConnect && state === "RTC_CONNECTED") setTimeout(() => {
                    const text = describe();
                    if (text) showToast(text, findAssetId("ServerIcon"));
                }, 1500);
            }),
            command({
                name: "voiceserver",
                description: tx("Show the voice server you're connected to (only you see it)"),
                run: (_, ctx) => void botMessage(ctx.channel.id, describe() ? `🔊 ${describe()}` : t("You're not connected to a voice channel.")),
            }),
        );
    },
});
