/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { api, botMessage, command, copy } from "../hooks";
import { canHere, unix } from "../shared/servers";

export default definePlugin({
    id: "endcord.invite-defaults",
    name: "InviteDefaults",
    description: tx("Create invites with your own defaults for how long they last and how many uses they have, with /invite"),
    icon: "LinkIcon",
    tags: ["Servers"],
    settings: {
        maxAge: {
            type: "select",
            label: tx("Expire after"),
            default: "604800",
            options: [
                { label: tx("30 minutes"), value: "1800" }, { label: tx("1 hour"), value: "3600" }, { label: tx("1 day"), value: "86400" },
                { label: tx("7 days"), value: "604800" }, { label: tx("Never"), value: "0" },
            ],
        },
        maxUses: { type: "number", label: tx("Max number of uses"), description: tx("0 means no limit"), default: 0, min: 0, max: 100 },
        temporary: { type: "boolean", label: tx("Temporary membership"), description: tx("People who join with it are kicked when they go offline unless they get a role"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "invite",
            description: tx("Create an invite to this channel with your defaults"),
            run: async (_, ctx) => {
                if (!ctx.channel.guild_id || !canHere("CREATE_INSTANT_INVITE", ctx.channel)) {
                    botMessage(ctx.channel.id, t("You don't have permission to do that here."));
                    return;
                }
                const invite = await api("post", `/channels/${ctx.channel.id}/invites`, { max_age: Number(store.maxAge), max_uses: store.maxUses, temporary: store.temporary, unique: true });
                copy(`https://discord.gg/${invite.code}`);
                botMessage(ctx.channel.id, `🔗 discord.gg/${invite.code}${invite.expires_at ? ` · ${t("Expires")}: <t:${unix(Date.parse(invite.expires_at))}:R>` : ""}`);
            },
        }));
    },
});
