/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Community plugins: the list of plugins for Discord on phones that the community keeps up to date (Purple-EyeZ's
 * Plugins-List, which other mods browse too), with whether each still works. A plugin Endcord has built in points to
 * Endcord's own, which is made for this Discord; the community's can still be installed from its menu.
 */

import { t } from "@core/i18n";
import { notices } from "@core/ui/settings/notices";
import { VdPluginManager } from "@core/vendetta/plugins";
import { useProxy } from "@core/vendetta/storage";
import { enablePlugin, isPluginEnabled, pluginSettings } from "@lib/addons/plugins";
import { findAssetId } from "@lib/api/assets";
import { useObservable } from "@lib/api/storage";
import { openAlert } from "@lib/ui/alerts";
import { hideSheet, showSheet } from "@lib/ui/sheets";
import { showToast } from "@lib/ui/toasts";
import { safeFetch } from "@lib/utils";
import compareNames from "@lib/utils/compareNames";
import { lazyDestructure } from "@lib/utils/lazy";
import { findByProps } from "@metro";
import { clipboard } from "@metro/common";
import { ActionSheet, AlertActionButton, AlertActions, AlertModal, Button, Card, FlashList, IconButton, TableRow, TableRowGroup, Text } from "@metro/common/components";
import { manifest } from "@plugins/manifest";
import { Search } from "@ui/components";
import { memo, ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, View } from "react-native";

const { showSimpleActionSheet, hideActionSheet } = lazyDestructure(() => findByProps("showSimpleActionSheet"));

const LIST_URL = "https://raw.githubusercontent.com/Purple-EyeZ/Plugins-List/refs/heads/main/src/plugins-data.json";
const MAX_PLUGINS = 2000;

type Status = "working" | "warning" | "broken";
type Filter = "working" | "broken" | "all";
type Sort = "newest" | "az" | "za";

interface CommunityPlugin {
    name: string;
    description: string;
    authors: string[];
    status: Status;
    /** What the list's maintainers say about it, in English */
    warning?: string;
    /** Also the ID it is installed under */
    installUrl: string;
    sourceUrl?: string;
    /** Endcord's built-in plugin of the same name */
    builtIn?: { id: string; name: string; };
    /** Its place in the list, which grows at the end */
    order: number;
}

// The list is anyone's pull request away from changing: only what is needed is taken from it, as plain text of a
// bounded length, and only https links
const httpsUrl = (value: unknown) => typeof value === "string" && /^https:\/\/\S+$/.test(value) ? value : undefined;
const textOf = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

function parseList(data: unknown): CommunityPlugin[] {
    if (!Array.isArray(data)) throw new Error("The plugin list isn't a list");
    const builtIns = new Map(manifest.map(p => [nameKey(p.name), { id: p.id, name: p.name }]));
    const seen = new Set<string>();
    const plugins: CommunityPlugin[] = [];
    // Far more than the list has ever had, so a broken or hostile one can't slow a phone down
    data.slice(0, MAX_PLUGINS).forEach((item, order) => {
        const name = textOf(item?.name, 80);
        const url = httpsUrl(item?.installUrl);
        if (!name || !url) return;
        // The plugin manager keeps plugins by their address with a slash at the end
        const installUrl = url.endsWith("/") ? url : `${url}/`;
        if (seen.has(installUrl)) return;
        seen.add(installUrl);
        plugins.push({
            name,
            description: textOf(item.description, 400),
            authors: Array.isArray(item.authors) ? item.authors.filter((a: unknown) => typeof a === "string").slice(0, 5).map((a: string) => a.slice(0, 40)) : [],
            status: item.status === "working" || item.status === "broken" ? item.status : "warning",
            warning: textOf(item.warningMessage, 300) || undefined,
            installUrl,
            sourceUrl: httpsUrl(item.sourceUrl),
            builtIn: builtIns.get(nameKey(name)),
            order,
        });
    });
    return plugins;
}

function useCommunityList() {
    const [list, setList] = useState<CommunityPlugin[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const mounted = useRef(true);
    const loaded = useRef(false);
    useEffect(() => () => void (mounted.current = false), []);

    const load = useCallback(() => {
        setLoading(true);
        setFailed(false);
        safeFetch(LIST_URL, { cache: "no-store" })
            .then(r => r.json())
            .then(data => {
                if (!mounted.current) return;
                setList(parseList(data));
                loaded.current = true;
                setLoading(false);
            })
            .catch(() => {
                if (!mounted.current) return;
                setFailed(true);
                setLoading(false);
                // The page only says so in place of an empty list; a refresh of one already shown says it here
                if (loaded.current) showToast(t("Couldn't load the plugin list. Check your connection and try again."), findAssetId("CircleXIcon-primary"));
            });
    }, []);
    useEffect(load, [load]);

    return { list, failed, loading, reload: load };
}

function install(plugin: CommunityPlugin, setBusy: (id: string, busy: boolean) => void) {
    setBusy(plugin.installUrl, true);
    VdPluginManager.installPlugin(plugin.installUrl)
        .then(() => showToast(t("Installed {name}", { name: plugin.name }), findAssetId("CheckmarkLargeIcon")))
        .catch(e => showToast(t("Couldn't install {name}: {error}", { name: plugin.name, error: errorText(e) }), findAssetId("CircleXIcon-primary")))
        .finally(() => setBusy(plugin.installUrl, false));
}

/** Installs the plugin, first saying what the user should know about it, if anything */
function confirmInstall(plugin: CommunityPlugin, setBusy: (id: string, busy: boolean) => void) {
    const notes: string[] = [];
    if (!notices.communityPluginsAcknowledged) {
        notes.push(t("Community plugins aren't checked by Endcord. They can read and do anything your Discord account can, so only install ones you trust."));
    }
    if (plugin.status === "broken") notes.push(t("This plugin is marked as broken on the current Discord."));
    else if (plugin.status === "warning") notes.push(t("This plugin is marked as having issues on the current Discord."));
    if (plugin.warning) notes.push(plugin.warning);
    if (plugin.builtIn) {
        notes.push(t("Endcord has {name} built in. Running both at once can make them get in each other's way.", { name: plugin.builtIn.name }));
    }
    if (!notes.length) return install(plugin, setBusy);

    openAlert("endcord-community-install", <AlertModal
        title={t("Install {name}?", { name: plugin.name })}
        content={notes.join("\n\n")}
        actions={<AlertActions>
            <AlertActionButton text={t("Install")} variant="primary" onPress={() => {
                notices.communityPluginsAcknowledged = true;
                install(plugin, setBusy);
            }} />
            <AlertActionButton text={t("Cancel")} variant="secondary" />
        </AlertActions>}
    />);
}

function confirmRemove(plugin: CommunityPlugin) {
    openAlert("endcord-community-remove", <AlertModal
        title={t("Remove {name}?", { name: plugin.name })}
        content={t("Its settings are deleted with it.")}
        actions={<AlertActions>
            <AlertActionButton text={t("Remove")} variant="destructive" onPress={() => {
                VdPluginManager.removePlugin(plugin.installUrl)
                    .then(() => showToast(t("Removed {name}", { name: plugin.name }), findAssetId("TrashIcon")))
                    .catch(e => showToast(t("Couldn't remove {name}: {error}", { name: plugin.name, error: errorText(e) }), findAssetId("CircleXIcon-primary")));
            }} />
            <AlertActionButton text={t("Cancel")} variant="secondary" />
        </AlertActions>}
    />);
}

function showMenu(plugin: CommunityPlugin, installed: boolean, setBusy: (id: string, busy: boolean) => void) {
    const close = () => hideSheet("endcord-community-plugin");
    showSheet("endcord-community-plugin", () => <ActionSheet>
        <TableRowGroup title={plugin.name}>
            {plugin.builtIn && !installed && <TableRow
                label={t("Install the community's version")}
                icon={<TableRow.Icon source={findAssetId("DownloadIcon")} />}
                onPress={() => {
                    close();
                    confirmInstall(plugin, setBusy);
                }}
            />}
            <TableRow
                label={t("Copy install link")}
                icon={<TableRow.Icon source={findAssetId("CopyIcon")} />}
                onPress={() => {
                    clipboard.setString(plugin.installUrl);
                    close();
                    showToast(t("Copied"), findAssetId("CopyIcon"));
                }}
            />
            {plugin.sourceUrl && <TableRow
                label={t("Open source code")}
                icon={<TableRow.Icon source={findAssetId("LinkExternalSmallIcon")} />}
                onPress={() => {
                    close();
                    Linking.openURL(plugin.sourceUrl!);
                }}
            />}
        </TableRowGroup>
    </ActionSheet>);
}

const STATUS: Record<Status, { label: () => string; color: string; }> = {
    working: { label: () => t("Works"), color: "text-feedback-positive" },
    warning: { label: () => t("Has issues"), color: "text-feedback-warning" },
    broken: { label: () => t("Broken"), color: "text-feedback-critical" },
};

interface CardProps {
    plugin: CommunityPlugin;
    installed: boolean;
    builtInOn: boolean;
    busy: boolean;
    setBusy(id: string, busy: boolean): void;
}

const PluginCard = memo(function PluginCard({ plugin, installed, builtInOn, busy, setBusy }: CardProps) {
    const status = STATUS[plugin.status];

    let action: ReactElement;
    if (installed) {
        action = <Button size="sm" variant="destructive" text={t("Remove")} onPress={() => confirmRemove(plugin)} />;
    } else if (plugin.builtIn) {
        const { id, name } = plugin.builtIn;
        action = <Button
            size="sm"
            variant="secondary"
            text={builtInOn ? t("Built-in is on") : t("Use built-in")}
            disabled={builtInOn}
            onPress={() => enablePlugin(id, true)
                .then(() => showToast(t("{name} is on", { name }), findAssetId("CheckmarkLargeIcon")))
                .catch(e => showToast(t("Couldn't turn on {name}: {error}", { name, error: errorText(e) }), findAssetId("CircleXIcon-primary")))}
        />;
    } else {
        action = <Button size="sm" text={t("Install")} loading={busy} disabled={busy} onPress={() => confirmInstall(plugin, setBusy)} />;
    }

    return <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flexShrink: 1, flexGrow: 1 }}>
                <Text variant="heading-md/semibold" numberOfLines={1}>{plugin.name}</Text>
                {!!plugin.authors.length && <Text variant="text-sm/medium" color="text-muted" numberOfLines={1}>
                    {t("by {authors}", { authors: plugin.authors.join(", ") })}
                </Text>}
            </View>
            <IconButton
                size="sm"
                variant="secondary"
                icon={findAssetId("MoreHorizontalIcon")}
                onPress={() => showMenu(plugin, installed, setBusy)}
            />
            {action}
        </View>
        <Text variant="text-sm/semibold" color={status.color}>
            {plugin.builtIn ? `${status.label()} · ${t("Built into Endcord as {name}", { name: plugin.builtIn.name })}` : status.label()}
        </Text>
        {!!plugin.description && <Text variant="text-md/medium">{plugin.description}</Text>}
        {!!plugin.warning && <Text variant="text-sm/medium" color="text-muted">{plugin.warning}</Text>}
    </Card>;
});

const Separator = () => <View style={{ height: 8 }} />;

export default function PluginBrowser() {
    const { list, failed, loading, reload } = useCommunityList();
    const installedPlugins = useProxy(VdPluginManager.plugins);
    useObservable([pluginSettings]);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("working");
    const [sort, setSort] = useState<Sort>("newest");
    const [busy, setBusyIds] = useState<ReadonlySet<string>>(new Set());

    const setBusy = useCallback((id: string, on: boolean) => setBusyIds(ids => {
        const next = new Set(ids);
        if (on) next.add(id);
        else next.delete(id);
        return next;
    }), []);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matches = (list ?? []).filter(p => {
            if (filter === "working" && p.status === "broken") return false;
            if (filter === "broken" && p.status !== "broken") return false;
            return !q || [p.name, p.description, ...p.authors].some(text => text.toLowerCase().includes(q));
        });
        if (sort === "az") return matches.sort((a, b) => compareNames(a.name, b.name));
        if (sort === "za") return matches.sort((a, b) => compareNames(b.name, a.name));
        return matches.sort((a, b) => b.order - a.order);
    }, [list, query, filter, sort]);

    const filters: Array<[Filter, string]> = [["working", t("Working")], ["broken", t("Not working")], ["all", t("All")]];
    const sorts: Array<[Sort, string]> = [["newest", t("Newest first")], ["az", t("Name (A-Z)")], ["za", t("Name (Z-A)")]];

    const header = <View style={{ gap: 10, paddingBottom: 8 }}>
        <Card>
            <Text variant="text-sm/medium" color="text-muted">
                {t("Plugins made by the community, not by Endcord, from a list its members keep up to date. They run with full access to your Discord account; only install ones you trust.")}
            </Text>
        </Card>
        <View style={{ flexDirection: "row", gap: 8 }}>
            <Search style={{ flexGrow: 1 }} isRound placeholder={t("Search plugins")} onChangeText={setQuery} />
            <IconButton
                icon={findAssetId("ArrowsUpDownIcon")}
                variant="tertiary"
                onPress={() => showSimpleActionSheet({
                    key: "EndcordCommunitySort",
                    header: { title: t("Sort by"), onClose: () => hideActionSheet("EndcordCommunitySort") },
                    options: sorts.map(([value, label]) => ({ label, onPress: () => setSort(value) })),
                })}
            />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
            {filters.map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? "primary" : "secondary"} text={label} onPress={() => setFilter(value)} />)}
        </ScrollView>
    </View>;

    const empty = loading && !list
        ? <ActivityIndicator style={{ marginVertical: 32 }} />
        : <View style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
            <Text variant="text-md/medium" color={failed ? "text-feedback-critical" : "text-muted"} style={{ textAlign: "center" }}>
                {failed ? t("Couldn't load the plugin list. Check your connection and try again.") : t("No results")}
            </Text>
            {failed && <Button size="md" variant="secondary" text={t("Try again")} icon={findAssetId("RetryIcon")} onPress={reload} />}
        </View>;

    return <FlashList
        data={shown}
        extraData={[installedPlugins, busy, pluginSettings]}
        keyExtractor={(p: CommunityPlugin) => p.installUrl}
        estimatedItemSize={150}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Separator}
        refreshing={loading && !!list}
        onRefresh={reload}
        contentContainerStyle={{ padding: 12, paddingBottom: 38 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }: { item: CommunityPlugin; }) => <PluginCard
            plugin={item}
            installed={item.installUrl in installedPlugins}
            builtInOn={!!item.builtIn && isPluginEnabled(item.builtIn.id)}
            busy={busy.has(item.installUrl)}
            setBusy={setBusy}
        />}
    />;
}
