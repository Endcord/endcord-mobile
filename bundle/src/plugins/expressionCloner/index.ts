/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { currentUserId, getStore } from "../common";
import { addMessageAction, api, describeError, getGuild } from "../hooks";
import { choose } from "../ui/dialogs";

/** An image as a data URL, which Discord's upload endpoints take */
async function dataUrl(url: string): Promise<string> {
    const blob = await fetch(url).then(r => r.blob());
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export default definePlugin({
    id: "endcord.expression-cloner",
    name: "ExpressionCloner",
    description: tx("Clone custom emojis from a message to your own servers from the message menu"),
    icon: "ReactionIcon",
    tags: ["Emotes", "Servers"],
    start({ cleanup }) {
        const emojis = (message: any) => [...new Set<string>(message.content?.match(/<a?:\w+:\d+>/g) ?? [])];
        const myServers = () => {
            const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions;
            const manage = permissions?.MANAGE_GUILD_EXPRESSIONS ?? permissions?.MANAGE_EMOJIS_AND_STICKERS;
            return Object.values<any>(getStore("GuildStore")?.getGuilds?.() ?? {})
                .filter(g => g.ownerId === currentUserId() || manage && getStore("PermissionStore")?.can?.(manage, g));
        };
        cleanup(addMessageAction({
            key: "expression-cloner",
            icon: "ReactionIcon",
            label: () => t("Clone Emoji"),
            visible: message => emojis(message).length > 0,
            onPress: message => {
                const list = emojis(message);
                const pickServer = (emoji: string) => {
                    const servers = myServers();
                    if (!servers.length) {
                        showToast(t("You can't add emojis to any of your servers"), findAssetId("CircleXIcon-primary"));
                        return;
                    }
                    choose(t("Clone to which server?"), servers.map(g => ({ label: g.name, value: g.id })), async guildId => {
                        const [, animated, name, id] = emoji.match(/<(a?):(\w+):(\d+)>/)!;
                        try {
                            const image = await dataUrl(`https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`);
                            await api("post", `/guilds/${guildId}/emojis`, { name, image });
                            showToast(t("Added :{name}: to {server}", { name, server: getGuild(guildId)?.name ?? "" }), findAssetId("CheckmarkLargeIcon"));
                        } catch (e: any) {
                            showToast(t("Couldn't clone the emoji: {error}", { error: describeError(e) }), findAssetId("CircleXIcon-primary"));
                        }
                    });
                };
                if (list.length === 1) pickServer(list[0]);
                else choose(t("Clone Emoji"), list.map(e => ({ label: e.replace(/^<a?:(\w+):\d+>$/, ":$1:"), value: e })), pickServer);
            },
        }));
    },
});
