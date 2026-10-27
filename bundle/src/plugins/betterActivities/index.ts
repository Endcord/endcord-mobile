/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { addMessageAction, displayName } from "../hooks";
import { showText } from "../ui/dialogs";

const ACTIVITY_VERBS = [tx("Playing"), tx("Streaming"), tx("Listening to"), tx("Watching"), "", tx("Competing in")];

export default definePlugin({
    id: "endcord.better-activities",
    name: "BetterActivities",
    description: tx("See everything a message's author is doing right now, from the message menu"),
    icon: "GameControllerIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        const activities = (id?: string): any[] => (id && getStore("PresenceStore")?.getActivities?.(id)) || [];
        cleanup(addMessageAction({
            key: "better-activities",
            icon: "GameControllerIcon",
            label: () => t("Activities"),
            visible: message => activities(message.author?.id).length > 0,
            onPress: message => showText(t("Activities of {user}", { user: displayName(message.author) }), activities(message.author.id).map(a => {
                if (a.type === 4) return `💬 ${[a.emoji?.name, a.state].filter(Boolean).join(" ")}`;
                const verb = ACTIVITY_VERBS[a.type] ? `${t(ACTIVITY_VERBS[a.type])} ` : "";
                const started = a.timestamps?.start ? ` · ${t("for {time}", { time: Math.round((Date.now() - a.timestamps.start) / 60000) + "m" })}` : "";
                return [`${verb}**${a.name}**${started}`, a.details, a.state].filter(Boolean).join("\n");
            }).join("\n\n")),
        }));
    },
});
