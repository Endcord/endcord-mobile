/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's BetterCommands: /refresh asks Discord again for the slash commands of the chat, its server and, when you
 * pick one, a bot, for when an app's new commands don't show up. PC also fills in a command's optional arguments and
 * takes Ctrl+Shift+Enter for a new line; the phone's command picker is a different one, and has no such keys.
 */

import { t, tx } from "@core/i18n";
import { FluxDispatcher } from "@metro/common";

import { definePlugin } from "../api";
import { botMessage, command, describeError, getUser } from "../hooks";

/** Discord fetches a target's commands again when asked with this action, as Endcord PC does */
function fetchIndex(target: Record<string, string>) {
    FluxDispatcher.dispatch({ type: "APPLICATION_COMMAND_INDEX_FETCH_REQUEST", target });
}

export default definePlugin({
    id: "endcord.better-commands",
    name: "BetterCommands",
    description: tx("Adds /refresh, which reloads the slash commands of a chat, its server or a bot when they don't show up"),
    icon: "SlashBoxIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "refresh",
            description: tx("Refreshes the specified applications commands locally"),
            options: [{ name: "user", description: tx("specific user to try and refresh"), type: "user" }],
            run: ({ user }, ctx) => {
                const channelId = ctx.channel.id;
                try {
                    botMessage(channelId, t("Refreshing application commands..."));
                    fetchIndex({ type: "channel", channelId });
                    const guildId: string | undefined = ctx.guild?.id ?? ctx.channel.guild_id;
                    if (guildId) fetchIndex({ type: "guild", guildId });
                    if (typeof user === "string" && user) {
                        const target = getUser(user);
                        fetchIndex(target?.bot ? { type: "application", applicationId: user } : { type: "user" });
                    }
                    botMessage(channelId, t("Commands refreshed successfully!"));
                } catch (e) {
                    botMessage(channelId, t("Couldn't refresh the commands: {error}", { error: describeError(e) }));
                }
            },
        }));
    },
});
