/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, subscribe } from "../common";
import { botMessage, command } from "../hooks";

export default definePlugin({
    id: "endcord.new-guild-settings",
    name: "NewGuildSettings",
    description: tx("Automatically mute new servers and change various other settings upon joining"),
    authors: [ENDCORD_AUTHOR],
    icon: "ServerIcon",
    tags: ["Servers", "Notifications"],
    settings: {
        guild: { type: "boolean", label: tx("Mute the server"), description: tx("Mute Guild automatically"), default: true },
        everyone: { type: "boolean", label: tx("Suppress @everyone and @here"), description: tx("Suppress @everyone and @here"), default: true },
        role: { type: "boolean", label: tx("Suppress role mentions"), description: tx("Suppress All Role @mentions"), default: true },
        highlights: { type: "boolean", label: tx("Suppress highlights"), description: tx("Suppress Highlights automatically"), default: true },
        events: { type: "boolean", label: tx("Mute new events"), description: tx("Mute New Events automatically"), default: true },
        messages: {
            type: "select",
            label: tx("Server Notification Settings"),
            default: "3",
            options: [
                { label: tx("All messages"), value: "0" },
                { label: tx("Only @mentions"), value: "1" },
                { label: tx("Nothing"), value: "2" },
                { label: tx("Server default"), value: "3" },
            ],
        },
    },
    start({ store, cleanup }) {
        const apply = (guildId?: string | null) => {
            const settings = findByProps("updateGuildNotificationSettings");
            if (!guildId || !settings) return;
            settings.updateGuildNotificationSettings(guildId, {
                muted: store.guild,
                suppress_everyone: store.everyone,
                suppress_roles: store.role,
                mute_scheduled_events: store.events,
                notify_highlights: store.highlights ? 1 : 0,
            });
            if (store.messages !== "3") settings.updateGuildNotificationSettings(guildId, { message_notifications: Number(store.messages) });
        };
        const applied = new Set<string>();
        const once = (guildId?: string | null) => {
            if (!guildId || applied.has(guildId)) return;
            applied.add(guildId);
            setTimeout(() => apply(guildId), 1500);
        };
        cleanup(
            subscribe("GUILD_CREATE", ({ guild }) => {
                const joined = Date.parse(guild?.joined_at ?? guild?.joinedAt ?? "");
                if (Date.now() - joined < 2 * 60_000) once(guild.id);
            }),
            subscribe("INVITE_ACCEPT_SUCCESS", ({ invite }) => once(invite?.guild?.id ?? invite?.guild_id)),
            subscribe("GUILD_JOIN_REQUEST_UPDATE", ({ guildId, request, status }) => {
                if (status === "APPROVED" && request?.user_id === currentUserId()) once(guildId);
            }),
            command({
                name: "newguildsettings",
                description: tx("Apply NewGuildSettings to this server now"),
                run: (_, ctx) => {
                    if (!ctx.channel.guild_id) {
                        botMessage(ctx.channel.id, t("This only works in a server."));
                        return;
                    }
                    apply(ctx.channel.guild_id);
                    botMessage(ctx.channel.id, t("Applied NewGuildSettings to this server."));
                },
            }),
        );
    },
});
