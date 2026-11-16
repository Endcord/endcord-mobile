/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's OverrideForumDefaults: forums open in the layout and sort order you pick rather than the ones the
 * server set. Like PC, it answers for Discord's channel records when Discord asks them for their default layout and
 * sort order (records/ChannelRecord.tsx, shared by the phone app), so a forum you've changed by hand keeps your choice.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { moduleAt } from "../common";
import { ownerOf, pickedValue } from "./owner";

const RECORDS = "records/ChannelRecord.tsx";
const LAYOUTS = "../discord_common/js/shared/shared-constants/ForumLayout.tsx";
const SORT_ORDERS = "../discord_common/js/shared/shared-constants/ThreadSortOrder.tsx";

export default definePlugin({
    id: "endcord.override-forum-defaults",
    name: "OverrideForumDefaults",
    description: tx("Allows you to override default forum layout/sort order. you can still change it on a per-channel basis"),
    icon: "ChatIcon",
    tags: ["Servers", "Customisation"],
    settings: {
        defaultLayout: {
            type: "select",
            label: tx("Which layout to use as default"),
            default: "1",
            options: [
                { label: tx("List"), value: "1" },
                { label: tx("Gallery"), value: "2" },
            ],
        },
        defaultSortOrder: {
            type: "select",
            label: tx("Which sort order to use as default"),
            default: "0",
            options: [
                { label: tx("Recently Active"), value: "0" },
                { label: tx("Date Posted"), value: "1" },
            ],
        },
    },
    start({ store, cleanup }) {
        const records = moduleAt(RECORDS);
        const forum = records?.ForumChannelRecord?.prototype ?? records?.ChannelRecordBase?.prototype;
        const layoutOwner = ownerOf(forum, "getDefaultLayout");
        const sortOwner = ownerOf(forum, "getDefaultSortOrder");
        if (!layoutOwner || !sortOwner) throw new Error("Discord's forum defaults weren't found");

        // Discord's own numbers for them where it has them, PC's (the same today) where it doesn't
        const layouts = moduleAt(LAYOUTS)?.ForumLayout;
        const orders = moduleAt(SORT_ORDERS)?.ThreadSortOrder;
        const layout = () => pickedValue(store.defaultLayout, { "1": layouts?.LIST, "2": layouts?.GRID }, 1);
        const sortOrder = () => pickedValue(store.defaultSortOrder, { "0": orders?.LATEST_ACTIVITY, "1": orders?.CREATION_DATE }, 0);

        cleanup(
            instead("getDefaultLayout", layoutOwner, () => layout()),
            instead("getDefaultSortOrder", sortOwner, () => sortOrder()),
        );
    },
});
