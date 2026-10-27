/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { getTimings } from "@core/timings";
import { Stack, TableRow, TableRowGroup, Text } from "@metro/common/components";

import { definePlugin } from "../api";
import { manifest } from "../manifest";

function TimingsPage() {
    const timings = getTimings();
    const names = Object.fromEntries(manifest.map(p => [p.id, p.name]));
    const plugins = Object.entries(timings.plugins).sort((a, b) => b[1] - a[1]);
    const total = plugins.reduce((n, [, ms]) => n + ms, 0);
    return <Stack spacing={12}>
        <TableRowGroup title={t("Endcord")}>
            <TableRow label={t("Endcord's own startup")} trailing={<TableRow.TrailingText text={timings.ready ? `${timings.ready - timings.loaded} ms` : "…"} />} />
            <TableRow label={t("Plugins started")} subLabel={t("{count} plugins", { count: plugins.length })} trailing={<TableRow.TrailingText text={`${total} ms`} />} />
        </TableRowGroup>
        {plugins.length > 0 && <TableRowGroup title={t("Plugins")}>
            {plugins.map(([id, ms]) => <TableRow key={id} label={names[id] ?? id} trailing={<TableRow.TrailingText text={`${ms} ms`} />} />)}
        </TableRowGroup>}
        <Text variant="text-xs/medium" color="text-muted">{t("Plugins load in the background, so a slow one doesn't hold Discord up. Only the plugins you turn on are loaded.")}</Text>
    </Stack>;
}

export default definePlugin({
    id: "endcord.startup-timings",
    name: "StartupTimings",
    description: tx("Shows how long Endcord and each of its plugins took to start, in the plugin's settings"),
    icon: "TimerIcon",
    tags: ["Utility"],
    SettingsComponent: TimingsPage,
    start() { },
});
