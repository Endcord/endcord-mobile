/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's StopAutoUnread: Discord switches a channel you read often to "All Messages" by itself; this stops it,
 * as PC does, by having Discord's maybeAutoUpgradeChannel decide against it every time. The phone app shares the code
 * that does it with the desktop app (UnreadSettingNoticeStore2); if this Discord doesn't have it, the plugin turns itself
 * off and says so.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { getStore } from "../common";

const METHOD = "maybeAutoUpgradeChannel";

export default definePlugin({
    id: "endcord.stop-auto-unread",
    name: "StopAutoUnread",
    description: tx("Stops Discord from automatically bumping a channels notification setting to \"All Messages\""),
    icon: "BellSlashIcon",
    tags: ["Notifications"],
    start({ cleanup }) {
        // The unread setting notice's store, where Discord keeps it, or wherever this Discord has moved it
        // Found by its store's name only: Discord's translation tables answer every name with a function,
        // maybeAutoUpgradeChannel included, so a search by that name could find them instead
        const owner = getStore("UnreadSettingNoticeStore2") ?? getStore("UnreadSettingNoticeStore");
        if (typeof owner?.[METHOD] !== "function") throw new Error("Discord's automatic switch to All Messages wasn't found");
        cleanup(instead(METHOD, owner, () => false));
    },
});
