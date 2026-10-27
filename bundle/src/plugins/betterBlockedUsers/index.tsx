/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { Stack, TextInput } from "@metro/common/components";
import { useState } from "react";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { copy } from "../hooks";
import { BLOCKED, failed, nameOf, removeRelationship, useRelationships } from "../shared/people";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";

function BlockedPage() {
    const all = useRelationships();
    const [query, setQuery] = useState("");
    const blocked = all.filter(([, type]) => type === BLOCKED).map(([id]) => id)
        .filter(id => !query || nameOf(id).toLowerCase().includes(query.toLowerCase()) || id.includes(query));
    return <Stack spacing={8}>
        <TextInput placeholder={t("Search")} value={query} onChange={setQuery} isClearable={true} />
        <LogList
            title={t("Blocked Users")}
            empty={t("Nobody is blocked")}
            entries={blocked.map(id => ({
                key: id,
                label: nameOf(id),
                subLabel: id,
                onPress: () => choose(nameOf(id), [{ label: t("Unblock"), value: "unblock", icon: "TrashIcon", danger: true }, { label: t("Copy User ID"), value: "copy", icon: "CopyIcon" }],
                    action => action === "unblock" ? removeRelationship(id).catch(failed) : copy(id)),
            }))}
        />
    </Stack>;
}

export default definePlugin({
    id: "endcord.better-blocked-users",
    name: "BetterBlockedUsers",
    description: tx("A searchable list of the people you blocked, to unblock them in one tap"),
    authors: [ENDCORD_AUTHOR],
    icon: "DenyIcon",
    tags: ["Friends", "Privacy"],
    SettingsComponent: BlockedPage,
    start() { },
});
