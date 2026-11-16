/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's security status (components/settings/tabs/endcord/SecurityStatus.tsx there), for the phone: what was
 * really checked about the code that runs, whether safe mode is on and why, the copies of the settings kept, and the
 * installed community plugins whose code does what plugins rarely need. Nothing here shows as fine without a check
 * behind it.
 */

import { isSafeMode } from "@core/debug/safeMode";
import { t } from "@core/i18n";
import { describeRisk, isSerious, type RiskFinding, scanPluginCode, SERIOUS } from "@core/pluginScan";
import { listSnapshots } from "@core/snapshots";
import { VdPluginManager } from "@core/vendetta/plugins";
import { isCorePlugin, isPluginInstalled, registeredPlugins } from "@lib/addons/plugins";
import { findAssetId } from "@lib/api/assets";
import { readFile } from "@lib/api/native/fs";
import { callLoaderMethod } from "@lib/api/native/modules";
import { settings } from "@lib/api/settings";
import formatDate from "@lib/utils/formatDate";
import { Stack, TableRow, TableRowGroup, Text } from "@metro/common/components";
import { ErrorBoundary } from "@ui/components";
import { useEdgeInsets } from "@ui/insets";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";

interface LoaderStatus {
    loader?: string;
    loaderVersion?: string;
    bundle?: "signed" | "unsigned" | "custom" | "builtin" | "none";
    requireSigned?: boolean;
    acceptedSequence?: number;
    /** Whether it puts the previous bundle back after an update that doesn't open */
    rollback?: boolean;
    rolledBack?: boolean;
}

/** What the loader reports about the bundle that runs; null from a loader that doesn't (the iOS one, older ones) */
function loaderStatus(): LoaderStatus | null {
    try {
        const status = callLoaderMethod<LoaderStatus>("endcord.security.status");
        return status && typeof status === "object" ? status : null;
    } catch {
        return null;
    }
}

const icon = (name: string) => <TableRow.Icon source={findAssetId(name)!} />;
const dateOf = (ms: number) => formatDate(ms, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

function BundleRows({ status }: { status: LoaderStatus | null; }) {
    if (!status) {
        return <TableRow label={t("Endcord's code")} subLabel={t("This loader doesn't report what it checked")} icon={icon("CircleInformationIcon-primary")} />;
    }
    const sequence = Number(status.acceptedSequence ?? 0);
    const bundle = {
        signed: [t("A signed release (#{sequence}), checked by the loader before it ran", { sequence }), "CircleCheckIcon-primary"],
        unsigned: [t("Not signed: no signed release has been accepted on this phone yet"), "WarningIcon"],
        custom: [t("From your own link in the developer settings, so it isn't checked"), "WarningIcon"],
        builtin: [t("The copy built into the app, used while no downloaded one runs"), "CircleInformationIcon-primary"],
        none: [t("This loader doesn't report what it checked"), "CircleInformationIcon-primary"],
    }[status.bundle ?? "none"] ?? [t("This loader doesn't report what it checked"), "CircleInformationIcon-primary"];
    return <>
        <TableRow label={t("Endcord's code")} subLabel={bundle[0]} icon={icon(bundle[1])} />
        {/* Only for downloaded releases: a bundle from your own link is yours to fix */}
        {status.rollback === true && status.bundle !== "custom" && <TableRow
            label={t("Going back after a bad update")}
            subLabel={status.rolledBack
                ? t("This start put the previous version back: the newest one didn't open three times in a row")
                : t("On: an update that doesn't open three times in a row is replaced by the one before it")}
            icon={icon(status.rolledBack ? "WarningIcon" : "CircleCheckIcon-primary")}
        />}
        {sequence > 0 && <TableRow
            label={t("Older versions")}
            subLabel={t("Refused: this phone doesn't take signed releases older than #{sequence}", { sequence })}
            icon={icon("CircleCheckIcon-primary")}
        />}
    </>;
}

function SafeModeRow() {
    const safe = isSafeMode();
    return <TableRow
        label={t("Safe mode")}
        subLabel={!safe
            ? t("Off. It turns on by itself after three starts in a row that don't open")
            : settings.safeMode?.fromCrashes
                ? t("On, because Discord didn't open three times in a row. Leave it from the General page")
                : t("On, turned on by you. Leave it from the General page")}
        icon={icon(safe ? "WarningIcon" : "CircleCheckIcon-primary")}
    />;
}

function SnapshotRow() {
    const [latest, setLatest] = useState<number | null | undefined>(undefined);
    useEffect(() => {
        listSnapshots().then(list => setLatest(list[0]?.at ?? null)).catch(() => setLatest(null));
    }, []);
    return <TableRow
        label={t("Copies of your settings")}
        subLabel={latest === undefined ? "…" : latest === null
            ? t("None yet: one is kept once a day, after Discord opens fine")
            : t("Last one kept {date}. Go back to one from the General page", { date: dateOf(latest) })}
        icon={icon("ClockIcon")}
    />;
}

interface CheckedPlugin {
    name: string;
    findings: RiskFinding[];
}

interface PluginCheck {
    checked: number;
    risky: CheckedPlugin[];
    /** Installed ones whose code couldn't be read, so weren't checked */
    unread: string[];
}

/** Every installed community plugin's code, read for what plugins rarely need */
async function checkInstalledPlugins(): Promise<PluginCheck> {
    const results: CheckedPlugin[] = [];
    const unread: string[] = [];
    for (const plugin of Object.values<any>(VdPluginManager.plugins ?? {})) {
        const name = plugin?.manifest?.name ?? plugin?.id ?? "?";
        if (typeof plugin?.js === "string") results.push({ name, findings: scanPluginCode(plugin.js) });
        else unread.push(name);
    }
    for (const [id, manifest] of registeredPlugins) {
        // Endcord's own plugins come with the app
        if (isCorePlugin(id) || !isPluginInstalled(id)) continue;
        const name = manifest.display?.name ?? id;
        const { jsPath } = (manifest as any);
        try {
            if (typeof jsPath !== "string") throw new Error("No code file");
            results.push({ name, findings: scanPluginCode(await readFile(jsPath)) });
        } catch {
            unread.push(name);
        }
    }
    return { checked: results.length, risky: results.filter(r => isSerious(r.findings)), unread };
}

function PluginRows() {
    const [result, setResult] = useState<PluginCheck | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        checkInstalledPlugins().then(setResult).catch(() => setFailed(true));
    }, []);
    if (failed) return <TableRow label={t("Community plugins")} subLabel={t("Their code couldn't be read, so it wasn't checked")} icon={icon("WarningIcon")} />;
    if (!result) return <TableRow label={t("Checking the plugins' code…")} trailing={<ActivityIndicator />} />;
    return <>
        {!result.risky.length && <TableRow
            label={t("Community plugins")}
            subLabel={result.checked
                ? t("{count} checked: none shows what plugins rarely need. Code can still hide what it does", { count: result.checked })
                : result.unread.length ? t("None could be checked") : t("None installed. Endcord's own plugins come with the app")}
            icon={icon(result.checked || !result.unread.length ? "CircleCheckIcon-primary" : "WarningIcon")}
        />}
        {result.risky.map(plugin => <TableRow
            key={plugin.name}
            label={plugin.name}
            subLabel={plugin.findings.filter(f => SERIOUS.has(f.kind)).map(describeRisk).join("\n")}
            icon={icon("WarningIcon")}
        />)}
        {result.unread.map(name => <TableRow
            key={`unread-${name}`}
            label={name}
            subLabel={t("Its code couldn't be read, so it wasn't checked")}
            icon={icon("WarningIcon")}
        />)}
    </>;
}

export default function Security() {
    const { bottom } = useEdgeInsets();
    const [status] = useState(loaderStatus);
    return <ErrorBoundary>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 + bottom }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <Text variant="text-sm/medium" color="text-muted">
                    {t("What Endcord checked about the code that runs in Discord. Nothing shows as fine here without a check behind it.")}
                </Text>
                <TableRowGroup title={t("Updates")}>
                    <BundleRows status={status} />
                </TableRowGroup>
                <TableRowGroup title={t("If something breaks")}>
                    <SafeModeRow />
                    <SnapshotRow />
                </TableRowGroup>
                <TableRowGroup title={t("Plugins")}>
                    <PluginRows />
                </TableRowGroup>
            </Stack>
        </ScrollView>
    </ErrorBoundary>;
}
