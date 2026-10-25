/*
 * Endcord for Android
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { before } from "@lib/api/patcher";
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
        if (typeof (TextInput as any)?.render !== "function") throw new Error("React Native's text input wasn't found");

        cleanup(before("render", TextInput, (args: any[]) => {
            const [props] = args;
            if (!props) return;
            const extra: Record<string, string> = {};
            if (store.caretColor && props.cursorColor == null) extra.cursorColor = store.caretColor;
            if (store.selectionColor && props.selectionColor == null) {
                // Selected text stays readable through a translucent highlight
                extra.selectionColor = `${store.selectionColor}66`;
                extra.selectionHandleColor = store.selectionColor;
            }
            if (Object.keys(extra).length) return [{ ...props, ...extra }, ...args.slice(1)];
        }));
    },
});

export default plugin;
