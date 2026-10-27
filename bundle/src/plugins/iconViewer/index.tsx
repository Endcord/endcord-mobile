/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { iterateAssets } from "@lib/api/assets";
import { Stack, TextInput } from "@metro/common/components";
import { useMemo, useState } from "react";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { copy } from "../hooks";
import LogList from "../ui/LogList";

function IconsPage() {
    const [query, setQuery] = useState("");
    // Read once, when the page opens: every icon module is loaded for it
    const names = useMemo(() => [...new Set([...iterateAssets()].map(a => a?.name).filter((n): n is string => typeof n === "string"))].sort(), []);
    const q = query.trim().toLowerCase();
    const matches = (q ? names.filter(n => n.toLowerCase().includes(q)) : names).slice(0, 60);
    return <Stack spacing={8}>
        <TextInput isClearable placeholder={t("Search {count} icons", { count: names.length })} value={query} onChange={(v: string) => setQuery(v)} />
        <LogList
            title={t("Icons")}
            empty={t("No icon has that name")}
            entries={matches.map(name => ({ key: name, label: name, icon: name, onPress: () => copy(name) }))}
        />
    </Stack>;
}

export default definePlugin({
    id: "endcord.icon-viewer",
    name: "IconViewer",
    description: tx("Browse and search all of Discord's icons in the plugin's settings, and copy their names"),
    authors: [ENDCORD_AUTHOR],
    icon: "ImageIcon",
    tags: ["Utility"],
    SettingsComponent: IconsPage,
    start() { },
});
