import { Strings, t } from "@core/i18n";
import AddonPage from "@core/ui/components/AddonPage";
import { notices } from "@core/ui/settings/notices";
import PluginCard from "@core/ui/settings/pages/Plugins/components/PluginCard";
import { VdPluginManager } from "@core/vendetta/plugins";
import { useProxy } from "@core/vendetta/storage";
import { isCorePlugin, isPluginInstalled, pluginSettings, registeredPlugins } from "@lib/addons/plugins";
import { Author } from "@lib/addons/types";
import { findAssetId } from "@lib/api/assets";
import { settings } from "@lib/api/settings";
import { useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import compareNames from "@lib/utils/compareNames";
import { BUNNY_PROXY_PREFIX, CLASSIC_URL, VD_PROXY_PREFIX } from "@lib/utils/constants";
import { lazyDestructure } from "@lib/utils/lazy";
import { findByProps } from "@metro";
import { NavigationNative } from "@metro/common";
import { Button, Card, FlashList, IconButton, Text } from "@metro/common/components";
import { ComponentProps, createContext, useContext, useState } from "react";
import { Linking, ScrollView, View } from "react-native";

import { UnifiedPluginModel } from "./models";
import unifyBunnyPlugin from "./models/bunny";
import unifyVdPlugin from "./models/vendetta";
import { useNewPlugins } from "./newPlugins";

type Status = "all" | "enabled" | "disabled" | "new";

interface Filters {
    status: Status;
    setStatus(status: Status): void;
    tag: string | null;
    setTag(tag: string | null): void;
    total: number;
    enabled: number;
    tags: string[];
    hasNew: boolean;
}

const FiltersContext = createContext<Filters>(null!);

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress(): void; }) {
    return <Button size="sm" variant={selected ? "primary" : "secondary"} text={label} onPress={onPress} />;
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean; }) {
    return <Card style={{ flex: 1, alignItems: "center", paddingVertical: 10 }}>
        <Text variant="heading-xl/bold" color={accent ? "text-feedback-positive" : "text-strong"}>{String(value)}</Text>
        <Text variant="text-xs/semibold" color="text-muted">{label.replace(/:$/, "")}</Text>
    </Card>;
}

/** Aliucord plugins are built for Aliucord's older Discord; they can't run on this one */
function AliucordNotice() {
    useProxy(notices);
    if (notices.aliucordDismissed) return null;
    return <Card style={{ gap: 8 }}>
        <Text variant="text-md/semibold" color="text-strong">{t("Looking for Aliucord plugins?")}</Text>
        <Text variant="text-sm/medium" color="text-muted">
            {t("Aliucord plugins only work on the older Discord that Aliucord is built on, so they can't run here. This Endcord has Endcord's own plugins for the latest Discord. For Aliucord plugins, use Endcord Classic, which runs both.")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
            <Button size="sm" variant="secondary" text={t("Get Endcord Classic")} icon={findAssetId("LinkExternalSmallIcon")} onPress={() => Linking.openURL(CLASSIC_URL)} />
            <Button size="sm" variant="tertiary" text={t("Got it")} onPress={() => void (notices.aliucordDismissed = true)} />
        </View>
    </Card>;
}

/** Counters and filters, like Endcord PC's plugin manager */
function FiltersHeader() {
    const f = useContext(FiltersContext);
    const navigation = NavigationNative.useNavigation();
    const statuses: Array<[Status, string]> = [
        ["all", t("Show All")],
        ["enabled", t("Show Enabled")],
        ["disabled", t("Show Disabled")],
        ...(f.hasNew ? [["new", t("Show New")] as [Status, string]] : []),
    ];

    return <View style={{ gap: 10, marginTop: 12 }}>
        <AliucordNotice />
        <View style={{ flexDirection: "row", gap: 8 }}>
            <Stat label={t("Total Plugins:")} value={f.total} />
            <Stat label={t("Enabled Plugins:")} value={f.enabled} accent />
        </View>
        <Button
            size="md"
            variant="secondary"
            text={t("Browse community plugins")}
            icon={findAssetId("CompassIcon")}
            // Loaded before the page opens: a page that suspends while it loads blanks the whole settings stack, which
            // Discord's screen animations can't handle
            onPress={() => import("../PluginBrowser").then(({ default: PluginBrowser }) => navigation.push("BUNNY_CUSTOM_PAGE", {
                title: t("Community plugins"),
                render: PluginBrowser,
            }))}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
            {statuses.map(([status, label]) => <Chip key={status} label={label} selected={f.status === status} onPress={() => f.setStatus(status)} />)}
        </ScrollView>
        {f.tags.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
            {f.tags.map(tag => <Chip key={tag} label={t(tag)} selected={f.tag === tag} onPress={() => f.setTag(f.tag === tag ? null : tag)} />)}
        </ScrollView>}
    </View>;
}

const { openAlert } = lazyDestructure(() => findByProps("openAlert", "dismissAlert"));
const { AlertModal, AlertActions, AlertActionButton } = lazyDestructure(() => findByProps("AlertModal", "AlertActions"));

interface PluginPageProps extends Partial<ComponentProps<typeof AddonPage<UnifiedPluginModel>>> {
    useItems: () => unknown[];
}

function PluginPage(props: PluginPageProps) {
    const items = props.useItems();

    return <AddonPage<UnifiedPluginModel>
        CardComponent={PluginCard}
        title={Strings.PLUGINS}
        searchKeywords={[
            "name",
            "description",
            p => p.authors?.map(
                (a: Author | string) => typeof a === "string" ? a : a.name
            ).join() || ""
        ]}
        sortOptions={{
            [t("Popular first")]: byPopularity,
            [t("Name (A-Z)")]: (a, b) => compareNames(a.name, b.name),
            [t("Name (Z-A)")]: (a, b) => compareNames(b.name, a.name),
            [t("Enabled first")]: (a, b) => Number(b.isEnabled()) - Number(a.isEnabled()) || byPopularity(a, b),
            [t("Disabled first")]: (a, b) => Number(a.isEnabled()) - Number(b.isEnabled()) || byPopularity(a, b)
        }}
        safeModeHint={{ message: Strings.SAFE_MODE_NOTICE_PLUGINS }}
        items={items}
        {...props}
    />;
}

/** Endcord's popular plugins first, in Endcord PC's order, then Endcord's others, then installed plugins, by name */
function byPopularity(a: UnifiedPluginModel, b: UnifiedPluginModel) {
    const rank = (p: UnifiedPluginModel) => p.popular ?? (p.endcord ? 1000 : 2000);
    return rank(a) - rank(b) || compareNames(a.name, b.name);
}

export default function Plugins() {
    useProxy(settings);
    useProxy(VdPluginManager.plugins);
    useObservable([pluginSettings]);
    const navigation = NavigationNative.useNavigation();
    const [status, setStatus] = useState<Status>("all");
    const [tag, setTag] = useState<string | null>(null);

    const vdPlugins = Object.values(VdPluginManager.plugins).map(unifyVdPlugin);
    // Core plugins stay hidden, except Endcord's own, which users turn on and off
    const bnPlugins = [...registeredPlugins.values()]
        .filter(p => isPluginInstalled(p.id) && (!isCorePlugin(p.id) || p.extras?.endcord))
        .map(unifyBunnyPlugin);
    const all = [...bnPlugins, ...vdPlugins].sort(byPopularity);

    const newIds = useNewPlugins(all.map(p => p.id));
    for (const plugin of all) plugin.isNew = newIds.has(plugin.id);

    const shown = all.filter(p => {
        if (status === "enabled" && !p.isEnabled()) return false;
        if (status === "disabled" && p.isEnabled()) return false;
        if (status === "new" && !p.isNew) return false;
        return !tag || p.tags?.includes(tag);
    });

    const filters: Filters = {
        status, setStatus, tag, setTag,
        total: all.length,
        enabled: all.filter(p => p.isEnabled()).length,
        tags: [...new Set(all.flatMap(p => p.tags ?? []))].sort(),
        hasNew: newIds.size > 0,
    };

    return <FiltersContext.Provider value={filters}><PluginPage
        useItems={() => shown}
        filtered={status !== "all" || tag != null}
        ListHeaderComponent={() => {
            const unproxiedPlugins = Object.values(VdPluginManager.plugins).filter(p => !p.id.startsWith(VD_PROXY_PREFIX) && !p.id.startsWith(BUNNY_PROXY_PREFIX));
            if (!unproxiedPlugins.length) return <FiltersHeader />;

            return <View style={{ marginVertical: 12, marginHorizontal: 10 }}>
                <Card border="strong">
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", flexDirection: "row" }}>
                        <View style={{ gap: 6, flexShrink: 1 }}>
                            <Text variant="heading-md/bold">{t("Unproxied plugins found")}</Text>
                            <Text variant="text-sm/medium" color="text-muted">
                                {t("Plugins installed from unproxied sources may run unverified code in this app without your awareness.")}
                            </Text>
                        </View>
                        <View style={{ marginLeft: "auto" }}>
                            <IconButton
                                size="sm"
                                variant="secondary"
                                icon={findAssetId("CircleInformationIcon-primary")}
                                style={{ marginLeft: 8 }}
                                onPress={() => {
                                    navigation.push("BUNNY_CUSTOM_PAGE", {
                                        title: t("Unproxied plugins"),
                                        render: () => {
                                            return <FlashList
                                                data={unproxiedPlugins}
                                                contentContainerStyle={{ padding: 8 }}
                                                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                                                renderItem={({ item: p }: any) => <Card>
                                                    <Text variant="heading-md/semibold">{p.id}</Text>
                                                </Card>}
                                            />;
                                        }
                                    });
                                }}
                            />
                        </View>
                    </View>
                </Card>
                <FiltersHeader />
            </View>;
        }}
        installAction={{
            label: Strings.INSTALL_PLUGIN,
            fetchFn: async (url: string) => {
                if (!url.startsWith(VD_PROXY_PREFIX) && !url.startsWith(BUNNY_PROXY_PREFIX) && !settings.developerSettings) {
                    openAlert("bunny-plugin-unproxied-confirmation", <AlertModal
                        title={Strings.MODAL_UNPROXIED_PLUGIN_HEADER}
                        content={Strings.MODAL_UNPROXIED_PLUGIN_DESC}
                        extraContent={<Card><Text variant="text-md/bold">{url}</Text></Card>}
                        actions={<AlertActions>
                            <AlertActionButton text={Strings.CONTINUE} variant="primary" onPress={() => {
                                VdPluginManager.installPlugin(url)
                                    .then(() => showToast(Strings.TOASTS_INSTALLED_PLUGIN, findAssetId("DownloadIcon")))
                                    .catch(e => openAlert("bunny-plugin-install-failed", <AlertModal
                                        title={t("Install failed")}
                                        content={t("Couldn't install the plugin from {url}:", { url })}
                                        extraContent={<Card><Text variant="text-md/normal">{e instanceof Error ? e.message : String(e)}</Text></Card>}
                                        actions={<AlertActionButton text={t("OK")} variant="primary" />}
                                    />));
                            }} />
                            <AlertActionButton text={Strings.CANCEL} variant="secondary" />
                        </AlertActions>}
                    />);
                } else {
                    return await VdPluginManager.installPlugin(url);
                }
            }
        }}
    /></FiltersContext.Provider>;
}
