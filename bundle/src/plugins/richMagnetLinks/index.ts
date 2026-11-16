/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's RichMagnetLinks: a magnet link in a message is shown as a magnet and the name of the file it's for,
 * rather than as a long line of letters and numbers. On PC that is a link that opens your torrent app. On the phone,
 * links in messages only open in the browser (another kind of link could start any app), so here the message's
 * long-press menu has "Copy Magnet Link", to paste it into a torrent app. Copying the message's text gives the links
 * as they were sent.
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction, copy, onMessageRow, RowOrder } from "../hooks";
import { pickOne } from "../shared/actions";
import { magnetLinks, magnetName, mapText, shortenMagnets } from "./magnet";

export default definePlugin({
    id: "endcord.rich-magnet-links",
    name: "RichMagnetLinks",
    description: tx("Shows magnet links in messages as a magnet and the file's name, and adds Copy Magnet Link to the message's long-press menu."),
    icon: "LinkIcon",
    tags: ["Appearance", "Chat"],
    start({ cleanup }) {
        cleanup(
            onMessageRow("rich-magnet-links", (row, message) => {
                if (!Array.isArray(row.content) || typeof message.content !== "string" || !message.content.includes("magnet:?")) return;
                const unknown = t("unknown filename");
                row.content = mapText(row.content, text => shortenMagnets(text, unknown));
            }, RowOrder.ADJUST),
            addMessageAction({
                key: "rich-magnet-links",
                icon: "CopyIcon",
                label: () => t("Copy Magnet Link"),
                visible: message => magnetLinks(message.content).length > 0,
                onPress: message => pickOne(t("Copy Magnet Link"), magnetLinks(message.content).slice(0, 10), link => `🧲 ${magnetName(link) ?? t("unknown filename")}`, link => copy(link)),
            }),
        );
    },
});
