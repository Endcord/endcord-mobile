/*
 * Endcord for Android
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Only in --test bundles: shows Endcord's settings pages over whatever Discord shows (the login screen, on the
 * emulator), inside a navigator of their own, so the emulator workflow can take screenshots of them.
 */

import { addOverlay } from "@core/overlay";
import { CustomPageRenderer } from "@lib/ui/settings/patches/shared";
import { NavigationNative, navigationStack, tokens } from "@metro/common";
import { ComponentType, useEffect, useReducer } from "react";
import { StyleSheet, View } from "react-native";

let current: { title: string; render: ComponentType; } | null = null;
let Stack: any;
const listeners = new Set<() => void>();

function TestScreen() {
    const [, update] = useReducer(n => n + 1, 0);
    useEffect(() => {
        listeners.add(update);
        return () => void listeners.delete(update);
    }, []);

    if (!current) return null;
    Stack ??= navigationStack.createStackNavigator();
    const Independent = NavigationNative.NavigationIndependentTree ?? (({ children }: any) => children);

    // Remounted for each page, so its params apply
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: tokens.colors.BG_BASE_PRIMARY ?? "#1E1F22" }]}>
        <Independent key={current.title}>
            <NavigationNative.NavigationContainer independent={!NavigationNative.NavigationIndependentTree}>
                <Stack.Navigator>
                    <Stack.Screen
                        name="BUNNY_CUSTOM_PAGE"
                        component={CustomPageRenderer}
                        initialParams={{ title: current.title, render: current.render }}
                    />
                </Stack.Navigator>
            </NavigationNative.NavigationContainer>
        </Independent>
    </View>;
}

let removeOverlay: (() => void) | null = null;

/** Shows a page until the next call; null hides the overlay */
export function showTestScreen(screen: typeof current) {
    if (!removeOverlay) removeOverlay = addOverlay("endcord-test-screen", TestScreen);
    current = screen;
    listeners.forEach(l => l());
    if (!screen) {
        removeOverlay?.();
        removeOverlay = null;
    }
}
