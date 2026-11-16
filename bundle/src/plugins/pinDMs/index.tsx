/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, useProxy } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command } from "../hooks";
import { bySection } from "../shared/lists";
import { channelLabel, listOf, pinnedFirst, pins, rewriteResult, toggleIn } from "../shared/navigation";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

/** Draws the DM list again with the current pins, while the plugin runs */
let refresh: (() => void) | undefined;

function PinnedDMsPage() {
    useProxy(pins);
    return <LogList
        title={t("Pinned DMs")}
        empty={t("Open a DM and use /pindm to pin it")}
        entries={listOf("dms").map(id => ({
            key: id,
            label: channelLabel(id),
            icon: "PinIcon",
            onPress: () => choose(channelLabel(id), [{ label: t("Unpin"), value: id }], () => {
                toggleIn("dms", id);
                refresh?.();
            }),
        }))}
    />;
}

export default definePlugin({
    id: "endcord.pin-dms",
    name: "PinDMs",
    description: tx("Pin DMs to the top of your DM list with /pindm"),
    icon: "PinIcon",
    tags: ["Friends", "Utility"],
    SettingsComponent: PinnedDMsPage,
    async start({ cleanup }) {
        await awaitStorage(pins);
        const store = getStore("PrivateChannelSortStore");
        // Discord 353's DM list is getSortedChannels, in sections; older ones had getSortedPrivateChannels
        const patches = ["getPrivateChannelIds", "getSortedChannels", "getSortedPrivateChannels"]
            .map(method => rewriteResult(store, method, list => bySection(list, section => pinnedFirst(section, listOf("dms")))))
            .filter(p => p !== undefined);
        if (!patches.length) throw new Error("Discord's DM list wasn't found");
        refresh = () => patches.forEach(p => p.refresh());
        // Cleanups run last first: the list draws again once it's Discord's own, so the pins don't stay
        cleanup(
            () => store?.emitChange?.(),
            () => patches.forEach(p => p.unpatch()),
            () => void (refresh = undefined),
            command({
                name: "pindm",
                description: tx("Pin or unpin this DM"),
                run: (_, ctx) => {
                    if (ctx.channel.guild_id) return botMessage(ctx.channel.id, t("Use it in a DM."));
                    const pinned = toggleIn("dms", ctx.channel.id);
                    refresh?.();
                    showToast(pinned ? t("Pinned") : t("Unpinned"), findAssetId("PinIcon"));
                },
            }),
        );
    },
});
