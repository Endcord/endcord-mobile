/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, subscribe } from "../common";
import { api } from "../hooks";

export default definePlugin({
    id: "endcord.anti-nickname",
    name: "AntiNickname",
    description: tx("Automatically resets any nickname forcefully assigned to you in a server. Works even without admin permissions."),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Servers", "Customisation"],
    settings: {
        showToast: { type: "boolean", label: tx("Tell me"), description: tx("Show a notification when a forced nickname is removed"), default: true },
    },
    start({ store, cleanup }) {
        const resetting = new Set<string>();
        const reset = async (guildId: string, nick: string) => {
            if (resetting.has(guildId)) return;
            resetting.add(guildId);
            try {
                try {
                    await api("patch", `/users/@me/guilds/${guildId}/profile`, { nick: null });
                } catch {
                    await api("patch", `/guilds/${guildId}/members/@me`, { nick: "" });
                }
                if (store.showToast) showToast(t("AntiNickname: nickname \"{nick}\" removed", { nick }), findAssetId("CheckmarkLargeIcon"));
            } catch (e: any) {
                if (store.showToast) showToast(t("AntiNickname: couldn't reset nickname ({status})", { status: e?.status ?? "?" }), findAssetId("CircleXIcon-primary"));
            } finally {
                setTimeout(() => resetting.delete(guildId), 2000);
            }
        };
        // Nicknames you set yourself (Edit Server Profile, /nick) are yours to keep: the server, and when
        let own: { guildId?: string; at: number; } | undefined;
        const markOwn = (guildId?: unknown) => void (own = { guildId: typeof guildId === "string" ? guildId : undefined, at: Date.now() });
        const nicknames = findByProps("changeNickname");
        if (typeof nicknames?.changeNickname === "function") cleanup(before("changeNickname", nicknames, ([guildId]: any[]) => markOwn(guildId)));
        const identity = findByProps("saveGuildIdentityChanges");
        if (typeof identity?.saveGuildIdentityChanges === "function") cleanup(before("saveGuildIdentityChanges", identity, ([guildId]: any[]) => markOwn(guildId)));
        cleanup(subscribe("GUILD_MEMBER_UPDATE", ({ guildId, user, nick }) => {
            if (user?.id !== currentUserId() || !nick) return;
            if (own && Date.now() - own.at < 30_000 && (!own.guildId || own.guildId === guildId)) return;
            setTimeout(() => reset(guildId, nick), 300);
        }));
    },
});
