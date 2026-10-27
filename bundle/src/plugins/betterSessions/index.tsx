/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { useEffect, useState } from "react";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { api } from "../hooks";
import { prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

interface Session {
    id_hash: string;
    approx_last_used_time?: string;
    client_info?: { os?: string; platform?: string; location?: string; };
}

const sessionState = wrapSync(createStorage<{ known: string[]; names: Record<string, string>; }>(createMMKVBackend("ENDCORD_SESSIONS", { known: [], names: {} })));

function SessionsPage() {
    useProxy(sessionState);
    const [sessions, setSessions] = useState<Session[] | null>(null);
    useEffect(() => {
        api("get", "/auth/sessions").then(r => setSessions(r?.user_sessions ?? [])).catch(() => setSessions([]));
    }, []);
    return <LogList
        title={t("Devices")}
        empty={sessions === null ? t("Loading...") : t("No devices found")}
        entries={(sessions ?? []).map(s => ({
            key: s.id_hash,
            label: sessionState.names?.[s.id_hash] || [s.client_info?.platform, s.client_info?.os].filter(Boolean).join(" · ") || t("Unknown device"),
            subLabel: `${s.client_info?.location ?? ""}${s.approx_last_used_time ? ` · ${new Date(s.approx_last_used_time).toLocaleString()}` : ""}`,
            icon: "MobilePhoneIcon",
            onPress: () => {
                prompt({
                    title: t("Name This Device"),
                    initial: sessionState.names?.[s.id_hash] ?? "",
                    allowEmpty: true,
                    onSubmit: name => void (sessionState.names = { ...(sessionState.names ?? {}), [s.id_hash]: name.trim() }),
                });
            },
        }))}
    />;
}

export default definePlugin({
    id: "endcord.better-sessions",
    name: "BetterSessions",
    description: tx("See your logged-in devices with exact times and your own names for them, and get told about new logins"),
    authors: [ENDCORD_AUTHOR],
    icon: "MobilePhoneIcon",
    tags: ["Privacy", "Utility"],
    settings: {
        backgroundCheck: { type: "boolean", label: tx("Watch for new logins"), description: tx("Check for new sessions in the background, and display notifications when they are detected"), default: true },
    },
    SettingsComponent: SessionsPage,
    async start({ store, cleanup }) {
        await awaitStorage(sessionState);
        const check = async () => {
            if (!store.backgroundCheck) return;
            try {
                const sessions: Session[] = (await api("get", "/auth/sessions"))?.user_sessions ?? [];
                const known = new Set(sessionState.known ?? []);
                const fresh = sessions.filter(s => !known.has(s.id_hash));
                if (known.size && fresh.length) {
                    const s = fresh[0];
                    showToast(t("New login: {device}", { device: [s.client_info?.platform, s.client_info?.os, s.client_info?.location].filter(Boolean).join(" · ") }), findAssetId("ShieldIcon"));
                }
                sessionState.known = sessions.map(s => s.id_hash);
            } catch { }
        };
        const timer = setInterval(check, 15 * 60_000);
        const first = setTimeout(check, 10_000);
        cleanup(() => clearInterval(timer), () => clearTimeout(first));
    },
});
