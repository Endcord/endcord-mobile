/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * A layer above all of Discord's screens that plugins can draw on, and the position of the last touch anywhere in the
 * app. Discord's root component is wrapped once at startup; with no overlays it renders nothing extra.
 */

import { instead } from "@lib/api/patcher";
import { ErrorBoundary } from "@lib/ui/components";
import { ReactNative } from "@metro/common";
import { ComponentType, useEffect, useReducer, useState } from "react";
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

let nextHostId = 0;
let activeHost: number | null = null;

function OverlayHost() {
    const [, update] = useReducer(n => n + 1, 0);
    const [id] = useState(() => nextHostId++);
    useEffect(() => {
        // The root can be wrapped twice (registerComponent and the wrapper provider); only one host draws
        activeHost ??= id;
        overlayListeners.add(update);
        update();
        return () => {
            overlayListeners.delete(update);
            if (activeHost === id) activeHost = null;
        };
    }, []);

    if (!overlays.size || activeHost !== id) return null;
    return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {[...overlays].map(([key, Overlay]) => <ErrorBoundary key={key}><Overlay /></ErrorBoundary>)}
    </View>;
}

function wrap(App: any, key: string) {
    if (App?.__endcordRoot) return App;
    const Wrapped = (props: any) => <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={track}
        onMoveShouldSetResponderCapture={track}
    >
        <App {...props} />
        <OverlayHost />
    </View>;
    Wrapped.displayName = `EndcordRoot(${App?.displayName ?? App?.name ?? key})`;
    Wrapped.__endcordRoot = true;
    console.log(`[Endcord] overlay host attached to ${key}`);
    return Wrapped;
}

/** @internal */
export function initOverlayHost() {
    const unpatches: Array<() => unknown> = [];
    try {
        const registry = ReactNative.AppRegistry;
        unpatches.push(instead("registerComponent", registry, (args: any[], original: Function) => {
            const [key, getComponent, ...rest] = args;
            if (typeof getComponent !== "function") return original(...args);
            return original(key, () => wrap(getComponent(), key), ...rest);
        }));

        // React Native's own hook for wrapping every root, in case Discord registers its root another way. A provider
        // Discord sets later is kept, inside ours.
        if (typeof registry.setWrapperComponentProvider === "function") {
            let inner: ((params: any) => ComponentType<any>) | null = null;
            const provider = (params: any) => {
                const Inner = inner?.(params);
                return ({ children }: { children: any; }) => <View
                    style={{ flex: 1 }}
                    onStartShouldSetResponderCapture={track}
                    onMoveShouldSetResponderCapture={track}
                >
                    {Inner ? <Inner {...params}>{children}</Inner> : children}
                    <OverlayHost />
                </View>;
            };
            unpatches.push(instead("setWrapperComponentProvider", registry, (args: any[], original: Function) => {
                inner = args[0];
                return original(provider);
            }));
            (registry.setWrapperComponentProvider as (p: unknown) => void)(null);
        }
    } catch (e) {
        console.error("[Endcord] overlay host couldn't be installed", e);
    }
    return () => unpatches.forEach(u => u());
}
