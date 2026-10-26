/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { after } from "@lib/api/patcher";
import { findByProps } from "@metro";
import { ReactNative } from "@metro/common";

import { definePlugin, ENDCORD_AUTHOR } from "../api";

const COLORS = [
    { label: tx("Discord's default"), value: "" },
    { label: tx("White"), value: "#FFFFFF" },
    { label: tx("Blurple"), value: "#5865F2" },
    { label: tx("Green"), value: "#23A55A" },
    { label: tx("Yellow"), value: "#F0B232" },
    { label: tx("Pink"), value: "#EB459E" },
    { label: tx("Red"), value: "#F23F43" },
];

const plugin = definePlugin({
    id: "endcord.smooth-type",
    name: "SmoothType",
    description: tx("Customize the text cursor and the selection color in text boxes."),
    authors: [ENDCORD_AUTHOR],
    popular: 5,
    icon: "PencilIcon",
    settings: {
        caretColor: { type: "select", label: tx("Caret Color"), default: "#5865F2", options: COLORS },
        selectionColor: { type: "select", label: tx("Selection color"), default: "", options: COLORS },
    },
    start({ store, cleanup }) {
        const { TextInput } = ReactNative;
        const runtime = findByProps("jsx", "jsxs");
        if (!TextInput || !runtime) throw new Error("React Native's text input wasn't found");

        // Every text input is created through the JSX runtime, whatever form TextInput takes in this React Native
        const colorize = (args: any[], element: any) => {
            if (args[0] !== TextInput || !element?.props) return;
            const { props } = element;
            if (store.caretColor && props.cursorColor == null) props.cursorColor = store.caretColor;
            if (store.selectionColor && props.selectionColor == null) {
                // Selected text stays readable through a translucent highlight
                props.selectionColor = `${store.selectionColor}66`;
                props.selectionHandleColor = store.selectionColor;
            }
        };
        cleanup(after("jsx", runtime, colorize), after("jsxs", runtime, colorize));
    },
});

export default plugin;
