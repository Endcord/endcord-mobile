/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { addOverlay, onTouch } from "@core/overlay";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";

import { definePlugin } from "../api";

const SPARKLE_COLORS = ["#ff4fd8", "#7c5cff", "#2ee6ff", "#fff27a", "#5cff9d"];

function Burst({ x, y, onDone }: { x: number; y: number; onDone(): void; }) {
    const progress = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(progress, { toValue: 1, duration: 550, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(onDone);
    }, []);
    return <>
        {Array.from({ length: 8 }, (_, i) => {
            const angle = (Math.PI * 2 * i) / 8;
            return <Animated.View
                key={i}
                style={{
                    position: "absolute",
                    left: x - 3,
                    top: y - 3,
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
                    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                    transform: [
                        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 34] }) },
                        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 34] }) },
                        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
                    ],
                }}
            />;
        })}
    </>;
}

function Sparkles() {
    const [bursts, setBursts] = useState<Array<{ id: number; x: number; y: number; }>>([]);
    useEffect(() => {
        let id = 0;
        return onTouch((x, y) => setBursts(b => [...b.slice(-6), { id: ++id, x, y }]));
    }, []);
    return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {bursts.map(b => <Burst key={b.id} x={b.x} y={b.y} onDone={() => setBursts(all => all.filter(o => o.id !== b.id))} />)}
    </View>;
}

export default definePlugin({
    id: "endcord.click-sparkles",
    name: "ClickSparkles",
    description: tx("Sprinkles little neon sparkles wherever you touch"),
    icon: "StarIcon",
    tags: ["Fun", "Appearance"],
    start({ cleanup }) {
        cleanup(addOverlay("click-sparkles", Sparkles));
    },
});
