/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { api, botMessage, command } from "../hooks";
import { unix } from "../shared/lookup";

export default definePlugin({
    id: "endcord.friend-invites",
    name: "FriendInvites",
    description: tx("Create, list and revoke friend invite links with /friendinvites"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserPlusIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        const invites = () => findByProps("createFriendInvite", "getAllFriendInvites");
        const line = (i: any) => `discord.gg/${i.code} · ${t("Expires")}: <t:${unix(new Date(i.expires_at).getTime())}:R> · ${t("Uses")}: \`${i.uses ?? 0}/${i.max_uses}\``;
        cleanup(command({
            name: "friendinvites",
            description: tx("Create, list or revoke your friend invite links"),
            options: [{
                name: "action",
                description: tx("What to do"),
                required: true,
                choices: [
                    { name: t("Create"), value: "create" },
                    { name: t("View"), value: "view" },
                    { name: t("Revoke all"), value: "revoke" },
                ],
            }],
            run: async ({ action }, ctx) => {
                const module = invites();
                if (action === "create") {
                    const invite = module?.createFriendInvite ? await module.createFriendInvite() : await api("post", "/users/@me/invites", {});
                    botMessage(ctx.channel.id, line(invite));
                } else if (action === "view") {
                    const all: any[] = module?.getAllFriendInvites ? await module.getAllFriendInvites() : await api("get", "/users/@me/invites");
                    botMessage(ctx.channel.id, all?.length ? all.map(line).join("\n") : t("You have no active friend invites!"));
                } else {
                    if (module?.revokeFriendInvites) await module.revokeFriendInvites();
                    else await api("del", "/users/@me/invites");
                    botMessage(ctx.channel.id, t("All friend invites have been revoked."));
                }
            },
        }));
    },
});
