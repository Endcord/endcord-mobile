/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's Quoter: an inspirational quote picture of a message, with its author's avatar, to send in the chat.
 * PC also saves it as a file or a GIF; here it's sent, as a PNG. PC's web fonts become the phone's own. The quote can
 * still go into your message box as text, as before.
 */

import { t, tx } from "@core/i18n";
import { createElement } from "react";

import { definePlugin } from "../api";
import { addMessageAction, copy, insertText } from "../hooks";
import { openPage } from "../ui/pages";
import { QuoteCardPage, svgModule } from "./QuoteCard";

export default definePlugin({
    id: "endcord.quoter",
    name: "Quoter",
    description: tx("Quote a message into your message box, or make an inspirational quote picture of it to send, from the message menu"),
    icon: "ChatIcon",
    tags: ["Chat"],
    settings: {
        quoteFont: {
            type: "select",
            label: tx("Quote font"),
            description: tx("Font for the quote picture's text"),
            default: "sans-serif-light",
            options: [
                { label: tx("Light"), value: "sans-serif-light" },
                { label: tx("Regular"), value: "sans-serif" },
                { label: tx("Serif"), value: "serif" },
                { label: tx("Monospace"), value: "monospace" },
            ],
        },
        watermark: { type: "string", label: tx("Watermark"), description: tx("Custom watermark text (max 32 characters)"), default: "Made with Endcord" },
        grayscale: { type: "boolean", label: tx("Grayscale"), description: tx("Enable grayscale by default"), default: true },
        showWatermark: { type: "boolean", label: tx("Show Watermark"), description: tx("Show watermark by default"), default: false },
    },
    start({ store, cleanup, logger }) {
        cleanup(addMessageAction({
            key: "quoter",
            icon: "ChatIcon",
            label: () => t("Quote"),
            visible: message => !!message.content?.trim(),
            onPress: message => {
                const quote = `${message.content.split("\n").map((l: string) => `> ${l}`).join("\n")}\n— <@${message.author.id}>\n`;
                if (!insertText(message.channel_id, quote)) copy(quote);
            },
        }));

        // The picture needs react-native-svg, which a newer Discord may not have; the text quote works without it
        if (!svgModule()) {
            logger.warn("react-native-svg wasn't found; quote pictures aren't offered");
            return;
        }
        cleanup(addMessageAction({
            key: "quoter-image",
            icon: "QuoteIcon",
            label: () => t("Quote Image"),
            visible: message => !!message.content?.trim() && !!message.author?.id,
            onPress: message => openPage(t("Catch Them In 4K."), ({ close }) => createElement(QuoteCardPage, { message, store, close })),
        }));
    },
});
