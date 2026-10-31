/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { callLoaderMethod, callLoaderMethodAsync } from "@lib/api/native/modules";
import { Stack, Text, TextInput } from "@metro/common/components";
import { useState } from "react";
import { Platform, View } from "react-native";

import { definePlugin, onSettingChange } from "../api";

const DEFAULT_COLOR = 0xffffff;

const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** The caret color as a number; earlier versions saved it as "#RRGGBB" */
function caretColorOf(store: any): number {
    const value = store.caretColor;
    if (typeof value === "number") return value;
    const n = typeof value === "string" ? parseInt(value.replace("#", ""), 16) : NaN;
    return Number.isNaN(n) ? DEFAULT_COLOR : n;
}

function CaretColor({ store }: { store: any; }) {
    useProxy(store);
    const color = caretColorOf(store);
    const [text, setText] = useState(toHex(color));
    const hex = text.replace("#", "");
    const valid = /^[0-9a-f]{6}$/i.test(hex);

    return <Stack spacing={8}>
        <Text variant="text-md/semibold">{t("Caret Color")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 40, height: 32, borderRadius: 4, backgroundColor: toHex(color) }} />
            <View style={{ flex: 1 }}>
                <TextInput
                    value={text}
                    placeholder="#ffffff"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={7}
                    onChange={(v: string) => {
                        setText(v);
                        const h = v.replace("#", "");
                        const n = parseInt(h, 16);
                        if (!Number.isNaN(n) && h.length === 6) store.caretColor = n;
                    }}
                    state={valid ? undefined : "error"}
                />
            </View>
        </View>
    </Stack>;
}

const plugin = definePlugin({
    id: "endcord.smooth-type",
    name: "SmoothType",
    description: tx("Fully customize the cursor caret — transition delay, easing, and color — for a smooth typing animation."),
    popular: 5,
    icon: "PencilIcon",
    tags: ["Appearance", "Customisation"],
    settings: {
        transitionDelay: { type: "number", label: tx("Transition Delay (ms)"), default: 60, min: 0, max: 2000 },
        animationType: {
            type: "select",
            label: tx("Animation Type"),
            default: "ease",
            options: [
                { label: tx("Ease"), value: "ease" },
                { label: tx("Linear"), value: "linear" },
                { label: tx("Ease-in"), value: "ease-in" },
                { label: tx("Ease-out"), value: "ease-out" },
                { label: tx("Ease-in-out"), value: "ease-in-out" },
            ],
        },
    },
    SettingsComponent: CaretColor,
    async start({ store, cleanup, logger }) {
        // The tweak replaces the cursor view UIKit has had since iOS 17
        if (Platform.OS === "ios" && parseInt(String(Platform.Version), 10) < 17) throw new Error(t("This needs iOS 17 or newer."));

        // Discord's message box is a native view, so the loader draws the caret; see SmoothCaret.kt and the iOS
        // tweak's SmoothCaret.x
        const args = (enabled: boolean) => ["endcord.smoothType.configure", enabled, caretColorOf(store), store.transitionDelay, store.animationType] as const;
        let apply: (enabled: boolean) => unknown;
        try {
            callLoaderMethod(...args(true));
            apply = enabled => callLoaderMethod(...args(enabled));
        } catch (syncError) {
            // The synchronous bridge goes through react-native-svg; without it, the asynchronous one
            try {
                await callLoaderMethodAsync(...args(true));
                apply = enabled => callLoaderMethodAsync(...args(enabled)).catch(e => logger.error("Couldn't set the caret", e));
            } catch (e) {
                logger.error("The loader can't draw the caret", syncError, e);
                // The iOS tweak draws it since 1.0.1; reinstalling is the Android installer's
                throw new Error(Platform.OS === "ios"
                    ? t("This needs a newer Endcord. Install the latest Endcord IPA.")
                    : t("This needs a newer Endcord. Install it again with Endcord Installer."));
            }
        }
        cleanup(
            onSettingChange(store, () => apply(true)),
            () => apply(false),
        );
    },
});

export default plugin;
