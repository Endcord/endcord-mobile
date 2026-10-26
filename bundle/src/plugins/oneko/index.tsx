/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The cat and its animation are from oneko.js by adryd (MIT), https://github.com/adryd325/oneko.js
 */

import { addOverlay, onTouch } from "@core/overlay";
import { tx } from "@core/i18n";
import { useEffect, useRef, useState } from "react";
import { Dimensions, Image, View } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";

const SPRITE = "https://raw.githubusercontent.com/adryd325/oneko.js/14bab15a755d0e35cd4ae19c931d96d306f99f42/oneko.gif";
const FRAME = 32;

// Sprite sheet positions, from oneko.js
const sprites: Record<string, [number, number][]> = {
    idle: [[-3, -3]],
    alert: [[-7, -3]],
    scratchSelf: [[-5, 0], [-6, 0], [-7, 0]],
    tired: [[-3, -2]],
    sleeping: [[-2, 0], [-2, -1]],
    N: [[-1, -2], [-1, -3]],
    NE: [[0, -2], [0, -3]],
    E: [[-3, 0], [-3, -1]],
    SE: [[-5, -1], [-5, -2]],
    S: [[-6, -3], [-7, -2]],
    SW: [[-5, -3], [-6, -1]],
    W: [[-4, -2], [-4, -3]],
    NW: [[-1, 0], [-1, -1]],
};

const plugin = definePlugin({
    id: "endcord.oneko",
    name: "oneko",
    description: tx("A little cat that runs to wherever you touch the screen."),
    authors: [ENDCORD_AUTHOR, { name: "adryd" }],
    popular: 8,
    icon: "EmojiSmilingFaceWithHeartsIcon",
    settings: {
        size: {
            type: "select",
            label: tx("Cat size"),
            default: "32",
            options: [
                { label: tx("Small"), value: "24" },
                { label: tx("Normal"), value: "32" },
                { label: tx("Large"), value: "48" },
            ],
        },
        speed: {
            type: "select",
            label: tx("Speed"),
            default: "10",
            options: [
                { label: tx("Slow"), value: "6" },
                { label: tx("Normal"), value: "10" },
                { label: tx("Fast"), value: "16" },
            ],
        },
    },
    start({ cleanup }) {
        cleanup(addOverlay("oneko", Neko));
    },
});

function Neko() {
    const size = Number(plugin.store.size) || 32;
    const speed = Number(plugin.store.speed) || 10;
    const { width, height } = Dimensions.get("window");
    const state = useRef({
        x: width / 2, y: height - 140, targetX: width / 2, targetY: height - 140,
        frameCount: 0, idleTime: 0, idleAnimation: null as string | null, idleFrame: 0,
    });
    const [frame, setFrame] = useState<{ x: number; y: number; sprite: [number, number]; }>({ x: state.current.x, y: state.current.y, sprite: sprites.idle[0] });

    useEffect(() => {
        const s = state.current;
        const stopTouch = onTouch((x, y) => {
            s.targetX = x;
            s.targetY = y;
        });

        const sprite = (name: string, f: number): [number, number] => sprites[name][f % sprites[name].length];

        const idle = () => {
            s.idleTime++;
            if (s.idleTime > 10 && Math.random() < 0.005 && s.idleAnimation == null) {
                s.idleAnimation = Math.random() < 0.5 ? "sleeping" : "scratchSelf";
            }
            switch (s.idleAnimation) {
                case "sleeping":
                    if (s.idleFrame < 8) return sprite("tired", 0);
                    if (s.idleFrame > 192) { s.idleAnimation = null; s.idleFrame = 0; }
                    return sprite("sleeping", Math.floor(s.idleFrame++ / 4));
                case "scratchSelf":
                    if (s.idleFrame > 9) { s.idleAnimation = null; s.idleFrame = 0; }
                    return sprite("scratchSelf", s.idleFrame++);
                default:
                    s.idleFrame++;
                    return sprite("idle", 0);
            }
        };

        const tick = setInterval(() => {
            s.frameCount++;
            const dx = s.x - s.targetX;
            const dy = s.y - s.targetY;
            const distance = Math.sqrt(dx ** 2 + dy ** 2);

            let current: [number, number];
            if (distance < speed || distance < size * 1.5) {
                current = idle();
            } else {
                s.idleAnimation = null;
                s.idleFrame = 0;
                if (s.idleTime > 1) {
                    // Notices the touch before running
                    current = sprite("alert", 0);
                    s.idleTime = Math.min(s.idleTime, 7) - 1;
                } else {
                    s.idleTime = 0;
                    let direction = dy / distance > 0.5 ? "N" : "";
                    direction += dy / distance < -0.5 ? "S" : "";
                    direction += dx / distance > 0.5 ? "W" : "";
                    direction += dx / distance < -0.5 ? "E" : "";
                    current = sprite(direction || "S", s.frameCount);
                    s.x -= (dx / distance) * speed;
                    s.y -= (dy / distance) * speed;
                    s.x = Math.min(Math.max(size / 2, s.x), width - size / 2);
                    s.y = Math.min(Math.max(size / 2, s.y), height - size / 2);
                }
            }
            setFrame({ x: s.x, y: s.y, sprite: current });
        }, 100);

        return () => {
            clearInterval(tick);
            stopTouch();
        };
    }, [size, speed]);

    const scale = size / FRAME;
    return <View
        pointerEvents="none"
        style={{ position: "absolute", left: frame.x - size / 2, top: frame.y - size / 2, width: size, height: size, overflow: "hidden" }}
    >
        <Image
            source={{ uri: SPRITE }}
            fadeDuration={0}
            style={{
                position: "absolute",
                width: 256 * scale,
                height: 128 * scale,
                left: frame.sprite[0] * size,
                top: frame.sprite[1] * size,
            }}
        />
    </View>;
}

export default plugin;
