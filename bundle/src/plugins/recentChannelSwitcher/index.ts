/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { awaitStorage } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { command } from "../hooks";
import { pickRecent, recents, recordRecents } from "../shared/navigation";

export default definePlugin({
    id: "endcord.recent-channel-switcher",
    name: "RecentChannelSwitcher",
    description: tx("Go back to the channels and DMs you opened recently with /recent"),
    icon: "ClockIcon",
    tags: ["Utility"],
    async start({ cleanup }) {
        await awaitStorage(recents);
        cleanup(recordRecents(), command({ name: "recent", description: tx("Switch to a channel you opened recently"), run: (_, ctx) => pickRecent(false, ctx.channel.id) }));
    },
});
