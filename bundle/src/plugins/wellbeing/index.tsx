/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { Stack, TableRow, TableRowGroup } from "@metro/common/components";
import { AppState } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, subscribe } from "../common";
import { localDay } from "../hooks";

interface Day {
    date: string;
    seconds: number;
    messages: number;
}

const wellbeing = wrapSync(createStorage<{ days: Day[]; }>(createMMKVBackend("ENDCORD_WELLBEING", { days: [] })));

const today = () => localDay();

function addToToday(change: Partial<Day>) {
    const days = Array.isArray(wellbeing.days) ? wellbeing.days : [];
    const date = today();
    const current = days.find(d => d.date === date) ?? { date, seconds: 0, messages: 0 };
    const updated = { ...current, seconds: current.seconds + (change.seconds ?? 0), messages: current.messages + (change.messages ?? 0) };
    wellbeing.days = [updated, ...days.filter(d => d.date !== date)].slice(0, 14);
}

const duration = (seconds: number) => {
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60);
    return h ? t("{hours}h {minutes}m", { hours: h, minutes: m }) : t("{minutes}m", { minutes: m });
};

function WellbeingPage() {
    useProxy(wellbeing);
    const days = Array.isArray(wellbeing.days) ? wellbeing.days : [];
    const week = days.slice(0, 7);
    const average = week.length ? week.reduce((s, d) => s + d.seconds, 0) / week.length : 0;
    const current = days.find(d => d.date === today());
    return <Stack spacing={12}>
        <TableRowGroup title={t("Today")}>
            <TableRow label={t("Screen time")} trailing={<TableRow.TrailingText text={duration(current?.seconds ?? 0)} />} icon={<TableRow.Icon source={findAssetId("ClockIcon")!} />} />
            <TableRow label={t("Messages sent")} trailing={<TableRow.TrailingText text={String(current?.messages ?? 0)} />} icon={<TableRow.Icon source={findAssetId("ChatIcon")!} />} />
        </TableRowGroup>
        <TableRowGroup title={t("Last 7 days")}>
            <TableRow label={t("Daily average")} trailing={<TableRow.TrailingText text={duration(average)} />} />
            {week.map(d => <TableRow key={d.date} label={new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} subLabel={t("{count} messages", { count: d.messages })} trailing={<TableRow.TrailingText text={duration(d.seconds)} />} />)}
        </TableRowGroup>
    </Stack>;
}

export default definePlugin({
    id: "endcord.wellbeing",
    name: "Wellbeing",
    description: tx("A gentle, private dashboard of how you use Discord: screen time, messages and break reminders. Everything stays on your phone."),
    authors: [ENDCORD_AUTHOR],
    icon: "HeartIcon",
    tags: ["Utility"],
    settings: {
        breakReminder: { type: "number", label: tx("Break reminder (minutes)"), description: tx("Remind me to take a break after this long in one go; 0 turns it off"), default: 45, min: 0, max: 600 },
    },
    SettingsComponent: WellbeingPage,
    async start({ store, cleanup }) {
        await awaitStorage(wellbeing);
        let activeSince = AppState.currentState === "active" ? Date.now() : 0;
        let sessionStart = activeSince;
        let reminded = false;
        const flush = () => {
            if (!activeSince) return;
            addToToday({ seconds: Math.round((Date.now() - activeSince) / 1000) });
            activeSince = Date.now();
        };
        const subscription = AppState.addEventListener("change", state => {
            if (state === "active") {
                activeSince = sessionStart = Date.now();
                reminded = false;
            } else {
                flush();
                activeSince = 0;
            }
        });
        const timer = setInterval(() => {
            flush();
            if (store.breakReminder > 0 && sessionStart && !reminded && Date.now() - sessionStart > store.breakReminder * 60_000) {
                reminded = true;
                showToast(t("You've been on Discord for {time}. Time for a break?", { time: duration(store.breakReminder * 60) }), findAssetId("HeartIcon"));
            }
        }, 60_000);
        cleanup(
            () => {
                flush();
                clearInterval(timer);
                subscription.remove();
            },
            subscribe("MESSAGE_CREATE", ({ message, optimistic }) => {
                if (optimistic && message?.author?.id === currentUserId()) addToToday({ messages: 1 });
            }),
        );
    },
});
