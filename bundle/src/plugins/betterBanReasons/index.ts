/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR, onSettingChange } from "../api";
import { api, botMessage, command } from "../hooks";
import { canHere } from "../shared/servers";

export default definePlugin({
    id: "endcord.better-ban-reasons",
    name: "BetterBanReasons",
    description: tx("Ban with /ban and your own saved reasons to pick from"),
    authors: [ENDCORD_AUTHOR],
    icon: "HammerIcon",
    tags: ["Servers"],
    settings: {
        reasons: {
            type: "string",
            label: tx("Your custom reasons"),
            description: tx("One per line; they're offered when you use /ban"),
            multiline: true,
            default: "Spam\nHarassment\nNSFW content\nRaiding",
        },
        deleteDays: { type: "number", label: tx("Delete their messages from the last (days)"), description: tx("0 keeps their messages"), default: 0, min: 0, max: 7 },
    },
    start({ store, cleanup }) {
        const reasons = () => store.reasons.split("\n").map(r => r.trim()).filter(Boolean).slice(0, 25);
        // The reasons are the command's choices, so it's registered again when they change
        let unregister: (() => void) | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const register = () => {
            unregister?.();
            unregister = banCommand();
        };
        cleanup(
            () => {
                clearTimeout(timer);
                unregister?.();
            },
            onSettingChange(store, key => {
                if (key !== "reasons") return;
                clearTimeout(timer);
                timer = setTimeout(register, 800);
            }),
        );
        const banCommand = () => command({
            name: "ban",
            description: tx("Ban someone from this server with a reason"),
            options: [
                { name: "user", description: tx("Who to ban"), type: "user", required: true },
                { name: "reason", description: tx("One of your saved reasons"), choices: reasons().map(r => ({ name: r.slice(0, 100), value: r })) },
                { name: "other", description: tx("Or write a reason") },
            ],
            run: async ({ user, reason: saved, other }, ctx) => {
                const reason = String(other ?? saved ?? "").trim() || undefined;
                const guildId = ctx.channel.guild_id;
                if (!guildId || !canHere("BAN_MEMBERS", ctx.channel)) {
                    botMessage(ctx.channel.id, t("You don't have permission to do that here."));
                    return;
                }
                const actions = findByProps("banUser", "kickUser") ?? findByProps("banUser");
                const seconds = store.deleteDays * 86400;
                if (actions?.banUser) await actions.banUser(guildId, user, seconds, reason);
                else await api("put", `/guilds/${guildId}/bans/${user}`, { delete_message_seconds: seconds });
                botMessage(ctx.channel.id, `🔨 ${reason ? t("Banned {user}: {reason}", { user: `<@${user}>`, reason }) : t("Banned {user}", { user: `<@${user}>` })}`);
            },
        });
        register();
    },
});
