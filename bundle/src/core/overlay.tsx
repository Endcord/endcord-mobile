/*
 * Endcord for Android
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * A layer above all of Discord's screens that plugins can draw on, and the position of the last touch anywhere in the
 * app. Discord's root component is wrapped once at startup; with no overlays it renders nothing extra.
 */

import { instead } from "@lib/api/patcher";
import { ErrorBoundary } from "@lib/ui/components";
import { ReactNative } from "@metro/common";
import { ComponentType, useEffect, useReducer } from "react";
import { GestureResponderEvent, StyleSheet, View } from "react-native";

const overlays = new Map<string, ComponentType>();
const overlayListeners = new Set<() => void>();
const touchListeners = new Set<(x: number, y: number) => void>();

export function addOverlay(key: string, component: ComponentType) {
    overlays.set(key, component);
    overlayListeners.forEach(l => l());
    return () => {
        overlays.delete(key);
        overlayListeners.forEach(l => l());
    };
}

/** Called with the screen position of every touch, without taking the touch from what is under it */
export function onTouch(listener: (x: number, y: number) => void) {
    touchListeners.add(listener);
    return () => void touchListeners.delete(listener);
}

function track(e: GestureResponderEvent) {
    if (touchListeners.size) {
        const { pageX, pageY } = e.nativeEvent;
        touchListeners.forEach(l => {
            try {
                l(pageX, pageY);
            } catch { }
        });
    }
    return false;
}

function OverlayHost() {
    const [, update] = useReducer(n => n + 1, 0);
    useEffect(() => {
        overlayListeners.add(update);
        return () => void overlayListeners.delete(update);
    }, []);

    if (!overlays.size) return null;
    return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {[...overlays].map(([key, Overlay]) => <ErrorBoundary key={key}><Overlay /></ErrorBoundary>)}
    </View>;
}

/** @internal */
export function initOverlayHost() {
    try {
        return instead("registerComponent", ReactNative.AppRegistry, (args: any[], original: Function) => {
            const [key, getComponent, ...rest] = args;
            if (typeof getComponent !== "function") return original(...args);

            return original(key, () => {
                const App = getComponent();
                const Wrapped = (props: any) => <View
                    style={{ flex: 1 }}
                    onStartShouldSetResponderCapture={track}
                    onMoveShouldSetResponderCapture={track}
                >
                    <App {...props} />
                    <OverlayHost />
                </View>;
                Wrapped.displayName = `EndcordRoot(${App?.displayName ?? App?.name ?? key})`;
                return Wrapped;
            }, ...rest);
        });
    } catch (e) {
        console.error("[Endcord] overlay host couldn't be installed", e);
    }
}
