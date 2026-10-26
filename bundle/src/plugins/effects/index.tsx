/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins that are just for fun, drawn on Endcord's overlay above the app, and Wellbeing.
 */

import { t, tx } from "@core/i18n";
import { addOverlay, onTouch } from "@core/overlay";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { Stack, TableRow, TableRowGroup } from "@metro/common/components";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Dimensions, Easing, Image, View } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, subscribe } from "../common";
import { currentChannelId, playSound } from "../hooks";

// Snowfall -------------------------------------------------------------------------------------------------------------

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
    icon: "SnowflakeIcon",
    tags: ["Fun", "Appearance"],
    settings: {
        amount: { type: "number", label: tx("Snowflakes"), description: tx("How many snowflakes fall at once"), default: 25, min: 5, max: 80 },
    },
    start({ cleanup }) {
        cleanup(addOverlay("snowfall", Snow));
    },
});

// ClickSparkles --------------------------------------------------------------------------------------------------------

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

const ClickSparkles = definePlugin({
    id: "endcord.click-sparkles",
    name: "ClickSparkles",
    description: tx("Sprinkles little neon sparkles wherever you click."),
    authors: [ENDCORD_AUTHOR],
    icon: "StarIcon",
    tags: ["Fun", "Appearance"],
    start({ cleanup }) {
        cleanup(addOverlay("click-sparkles", Sparkles));
    },
});

// Jumpscare ------------------------------------------------------------------------------------------------------------

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
    authors: [ENDCORD_AUTHOR],
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

// Moyai ----------------------------------------------------------------------------------------------------------------

const MOYAI_URL = "https://github.com/Equicord/Equibored/raw/main/sounds/moyai/moyai.mp3";

const Moyai = definePlugin({
    id: "endcord.moyai",
    name: "Moyai",
    description: tx("Plays a 🗿 sound effect whenever a moyai emoji is sent, reacted, or used as a voice effect in your current channel."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Fun"],
    settings: {
        volume: { type: "number", label: tx("Volume"), description: tx("From 0 to 100"), default: 50, min: 0, max: 100 },
        ignoreBlocked: { type: "boolean", label: tx("Ignore blocked users"), description: tx("Don't play the sound for blocked users"), default: true },
        triggerWhenUnfocused: { type: "boolean", label: tx("Only in the open chat"), description: tx("Only play it for the chat you have open"), default: true },
    },
    start({ store, cleanup }) {
        const boom = (channelId: string, count = 1) => {
            if (store.triggerWhenUnfocused && channelId !== currentChannelId()) return;
            for (let i = 0; i < Math.min(count, 10); i++) setTimeout(() => playSound(MOYAI_URL, store.volume / 100), i * 300);
        };
        cleanup(
            subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
                if (optimistic || !message?.content) return;
                const count = (message.content.match(/🗿|:moyai:/g) ?? []).length;
                if (count) boom(message.channel_id, count);
            }),
            subscribe("MESSAGE_REACTION_ADD", ({ channelId, emoji, userId }) => {
                if (emoji?.name === "🗿" && userId !== currentUserId()) boom(channelId);
            }),
        );
    },
});

// Wellbeing ------------------------------------------------------------------------------------------------------------

interface Day {
    date: string;
    seconds: number;
    messages: number;
}

const wellbeing = wrapSync(createStorage<{ days: Day[]; }>(createMMKVBackend("ENDCORD_WELLBEING", { days: [] })));
const today = () => new Date().toISOString().slice(0, 10);

function addToToday(change: Partial<Day>) {
    const days = Array.isArray(wellbeing.days) ? wellbeing.days : [];
    const date = today();
    const current = days.find(d => d.date === date) ?? { date, seconds: 0, messages: 0 };
    const updated = { ...current, seconds: current.seconds + (change.seconds ?? 0), messages: current.messages + (change.messages ?? 0) };
    wellbeing.days = [updated, ...days.filter(d => d.date !== date)].slice(0, 14);
}

const duration = (seconds: number) => {
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60);
    return h ? t("{hours}h {minutes}m", { hours: h, minutes: m }) : t("{minutes}m", { minutes: m });
};

function WellbeingPage() {
    useProxy(wellbeing);
    const days = Array.isArray(wellbeing.days) ? wellbeing.days : [];
    const week = days.slice(0, 7);
    const average = week.length ? week.reduce((s, d) => s + d.seconds, 0) / week.length : 0;
    const current = days.find(d => d.date === today());
    return <Stack spacing={12}>
        <TableRowGroup title={t("Today")}>
            <TableRow label={t("Screen time")} trailing={<TableRow.TrailingText text={duration(current?.seconds ?? 0)} />} icon={<TableRow.Icon source={findAssetId("ClockIcon")!} />} />
            <TableRow label={t("Messages sent")} trailing={<TableRow.TrailingText text={String(current?.messages ?? 0)} />} icon={<TableRow.Icon source={findAssetId("ChatIcon")!} />} />
        </TableRowGroup>
        <TableRowGroup title={t("Last 7 days")}>
            <TableRow label={t("Daily average")} trailing={<TableRow.TrailingText text={duration(average)} />} />
            {week.map(d => <TableRow key={d.date} label={new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} subLabel={t("{count} messages", { count: d.messages })} trailing={<TableRow.TrailingText text={duration(d.seconds)} />} />)}
        </TableRowGroup>
    </Stack>;
}

const Wellbeing = definePlugin({
    id: "endcord.wellbeing",
    name: "Wellbeing",
    description: tx("A gentle, private dashboard of how you use Discord — screen time, messages and calm controls. Everything stays on your computer."),
    authors: [ENDCORD_AUTHOR],
    icon: "HeartIcon",
    tags: ["Utility"],
    settings: {
        breakReminder: { type: "number", label: tx("Break reminder (minutes)"), description: tx("Remind me to take a break after this long in one go; 0 turns it off"), default: 45, min: 0, max: 600 },
    },
    SettingsComponent: WellbeingPage,
    async start({ store, cleanup }) {
        await awaitStorage(wellbeing);
        let activeSince = AppState.currentState === "active" ? Date.now() : 0;
        let sessionStart = activeSince;
        let reminded = false;
        const flush = () => {
            if (!activeSince) return;
            addToToday({ seconds: Math.round((Date.now() - activeSince) / 1000) });
            activeSince = Date.now();
        };
        const subscription = AppState.addEventListener("change", state => {
            if (state === "active") {
                activeSince = sessionStart = Date.now();
                reminded = false;
            } else {
                flush();
                activeSince = 0;
            }
        });
        const timer = setInterval(() => {
            flush();
            if (store.breakReminder > 0 && sessionStart && !reminded && Date.now() - sessionStart > store.breakReminder * 60_000) {
                reminded = true;
                showToast(t("You've been on Discord for {time}. Time for a break?", { time: duration(store.breakReminder * 60) }), findAssetId("HeartIcon"));
            }
        }, 60_000);
        cleanup(
            () => {
                flush();
                clearInterval(timer);
                subscription.remove();
            },
            subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
                if (optimistic && message?.author?.id === currentUserId()) addToToday({ messages: 1 });
            }),
        );
    },
});

export default [Snowfall, ClickSparkles, Jumpscare, Moyai, Wellbeing];
