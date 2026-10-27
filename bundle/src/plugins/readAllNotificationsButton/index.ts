/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { botMessage, command } from "../hooks";
import { readAll } from "../shared/notify";

export default definePlugin({
    id: "endcord.read-all-notifications",
    name: "ReadAllNotificationsButton",
    description: tx("Mark every server as read at once with /readall"),
    authors: [ENDCORD_AUTHOR],
    icon: "CheckmarkLargeIcon",
    tags: ["Notifications", "Servers"],
    start({ cleanup }) {
        cleanup(command({
            name: "readall",
            description: tx("Mark every server as read"),
            run: (_, ctx) => {
                const count = readAll();
                botMessage(ctx.channel.id, count ? t("Marked {count} channels as read.", { count }) : t("Everything is already read."));
            },
        }));
    },
});
