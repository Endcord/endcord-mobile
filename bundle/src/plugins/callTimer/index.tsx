/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { addOverlay } from "@core/overlay";
import { Text } from "@metro/common/components";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { subscribe } from "../common";
import { clock, myVoiceChannel } from "../shared/calls";

let callStarted: number | undefined;

function Timer() {
    const [, tick] = useState(0);
    const inCall = !!myVoiceChannel() && callStarted != null;
    useEffect(() => {
        // Only ticks while you're in a call; otherwise the overlay draws nothing and costs nothing
        if (!inCall) return;
        const timer = setInterval(() => tick(n => n + 1), 1000);
        return () => clearInterval(timer);
    }, [inCall]);
    if (!inCall) return null;
    const top = CallTimer.store.position === "top";
    return <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, [top ? "top" : "bottom"]: top ? 34 : 96, alignItems: "center" }}>
        <View style={{ backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text variant="text-xs/semibold" style={{ color: "white" }}>🔊 {clock(Date.now() - callStarted!)}</Text>
        </View>
    </View>;
}

let redrawTimer: (() => void) | undefined;

function TimerHost() {
    const [, update] = useState(0);
    useEffect(() => {
        redrawTimer = () => update(n => n + 1);
        return () => void (redrawTimer = undefined);
    }, []);
    return <Timer />;
}

const CallTimer = definePlugin({
    id: "endcord.call-timer",
    name: "CallTimer",
    description: tx("Shows how long you have been in the current voice call"),
    authors: [ENDCORD_AUTHOR],
    icon: "TimerIcon",
    tags: ["Voice"],
    settings: {
        position: {
            type: "select",
            label: tx("Where the timer is"),
            default: "top",
            options: [{ label: tx("Top of the screen"), value: "top" }, { label: tx("Above the message box"), value: "bottom" }],
        },
    },
    start({ cleanup }) {
        callStarted = myVoiceChannel() ? Date.now() : undefined;
        cleanup(
            () => void (callStarted = undefined),
            addOverlay("call-timer", TimerHost),
            subscribe("VOICE_CHANNEL_SELECT", ({ channelId }) => {
                if (!channelId) callStarted = undefined;
                else if (callStarted == null) callStarted = Date.now();
                redrawTimer?.();
            }),
        );
    },
});

export default CallTimer;
