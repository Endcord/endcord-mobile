/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { addOverlay } from "@core/overlay";
import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, View } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";

function Flake({ size, left, duration, delay, drift }: { size: number; left: number; duration: number; delay: number; drift: number; }) {
    const progress = useRef(new Animated.Value(0)).current;
    const { height } = Dimensions.get("window");
    useEffect(() => {
        const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration, delay, easing: Easing.linear, useNativeDriver: true }));
        loop.start();
        return () => loop.stop();
    }, []);
    return <Animated.Text
        style={{
            position: "absolute",
            top: -size * 2,
            left,
            fontSize: size,
            color: "white",
            opacity: 0.8,
            textShadowColor: "rgba(0,0,0,0.25)",
            textShadowRadius: 2,
            transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height + size * 4] }) },
                { translateX: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, 0] }) },
            ],
        }}
    >❄</Animated.Text>;
}

function Snow() {
    const count = Snowfall.store.amount;
    const [flakes] = useState(() => {
        const { width } = Dimensions.get("window");
        return Array.from({ length: count }, (_, i) => ({
            key: i,
            size: 8 + Math.random() * 10,
            left: Math.random() * width,
            duration: 7000 + Math.random() * 8000,
            delay: Math.random() * 8000,
            drift: (Math.random() - 0.5) * 60,
        }));
    });
    return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {flakes.map(({ key, ...f }) => <Flake key={key} {...f} />)}
    </View>;
}

const Snowfall = definePlugin({
    id: "endcord.snowfall",
    name: "Snowfall",
    description: tx("Let it snow on Discord"),
    authors: [ENDCORD_AUTHOR],
    icon: "EmojiColdFaceIcon",
    tags: ["Fun", "Appearance"],
    settings: {
        amount: { type: "number", label: tx("Snowflakes"), description: tx("How many snowflakes fall at once"), default: 25, min: 5, max: 80 },
    },
    start({ cleanup }) {
        cleanup(addOverlay("snowfall", Snow));
    },
});

export default Snowfall;
