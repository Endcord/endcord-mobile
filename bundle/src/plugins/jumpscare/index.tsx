/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { addOverlay } from "@core/overlay";
import { useEffect, useRef, useState } from "react";
import { Animated, Image } from "react-native";

import { definePlugin } from "../api";
import { subscribe } from "../common";
import { playSound } from "../hooks";

let scare: (() => void) | undefined;

function Scare() {
    const [visible, setVisible] = useState(false);
    const opacity = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        scare = () => {
            setVisible(true);
            opacity.setValue(1);
            Animated.timing(opacity, { toValue: 0, duration: 600, delay: 1200, useNativeDriver: true }).start(() => setVisible(false));
        };
        return () => void (scare = undefined);
    }, []);
    if (!visible) return null;
    return <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "black", opacity, alignItems: "center", justifyContent: "center" }}>
        <Image source={{ uri: Jumpscare.store.imageSource }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
    </Animated.View>;
}

const Jumpscare = definePlugin({
    id: "endcord.jumpscare",
    name: "Jumpscare",
    description: tx("Adds a configurable chance of jumpscaring you whenever you open a channel. Inspired by Geometry Dash Mega Hack"),
    tags: ["Fun"],
    settings: {
        chance: { type: "number", label: tx("Chance (1 in X)"), description: tx("The chance of a jumpscare happening (1 in X so: 100 = 1/100 or 1%, 50 = 1/50 or 2%, etc.)"), default: 100, min: 1, max: 100000 },
        imageSource: { type: "string", label: tx("Image"), description: tx("Sets the image url of the jumpscare"), default: "https://github.com/Equicord/Equibored/blob/main/icons/jumpscare/troll.gif?raw=true" },
        audioSource: { type: "string", label: tx("Sound"), description: tx("Sets the audio url of the jumpscare"), default: "https://github.com/Equicord/Equibored/raw/main/sounds/jumpscare/trollolol.mp3?raw=true" },
    },
    start({ store, cleanup }) {
        cleanup(
            addOverlay("jumpscare", Scare),
            subscribe("CHANNEL_SELECT", () => {
                if (Math.floor(Math.random() * store.chance) !== 0) return;
                scare?.();
                if (store.audioSource.trim()) playSound(store.audioSource.trim());
            }),
        );
    },
});

export default Jumpscare;
