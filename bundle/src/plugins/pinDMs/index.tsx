/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, useProxy } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { botMessage, command } from "../hooks";
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
    authors: [ENDCORD_AUTHOR],
    icon: "PinIcon",
    tags: ["Friends", "Utility"],
    SettingsComponent: PinnedDMsPage,
    async start({ cleanup }) {
        await awaitStorage(pins);
        const store = getStore("PrivateChannelSortStore");
        const patches = ["getPrivateChannelIds", "getSortedPrivateChannels"]
            .map(method => rewriteResult(store, method, list => pinnedFirst(list, listOf("dms"))))
            .filter(p => p !== undefined);
        if (!patches.length) throw new Error("Discord's DM list wasn't found");
        refresh = () => patches.forEach(p => p.refresh());
        cleanup(
            () => patches.forEach(p => p.unpatch()),
            () => store?.emitChange?.(),
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
