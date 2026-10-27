/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { awaitStorage } from "@core/vendetta/storage";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { command } from "../hooks";
import { pickRecent, recents, recordRecents } from "../shared/navigation";

export default definePlugin({
    id: "endcord.recent-dm-switcher",
    name: "RecentDMSwitcher",
    description: tx("Go back to the DMs you opened recently with /recentdms"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Friends", "Utility"],
    async start({ cleanup }) {
        await awaitStorage(recents);
        cleanup(recordRecents(), command({ name: "recentdms", description: tx("Switch to a DM you opened recently"), run: (_, ctx) => pickRecent(true, ctx.channel.id) }));
    },
});
