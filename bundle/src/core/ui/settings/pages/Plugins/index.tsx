import { Strings, t } from "@core/i18n";
import AddonPage from "@core/ui/components/AddonPage";
import PluginCard from "@core/ui/settings/pages/Plugins/components/PluginCard";
import { VdPluginManager } from "@core/vendetta/plugins";
import { useProxy } from "@core/vendetta/storage";
import { isCorePlugin, isPluginInstalled, pluginSettings, registeredPlugins } from "@lib/addons/plugins";
import { Author } from "@lib/addons/types";
import { findAssetId } from "@lib/api/assets";
import { settings } from "@lib/api/settings";
import { useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { BUNNY_PROXY_PREFIX, VD_PROXY_PREFIX } from "@lib/utils/constants";
import { lazyDestructure } from "@lib/utils/lazy";
import { findByProps } from "@metro";
import { NavigationNative } from "@metro/common";
import { Button, Card, FlashList, IconButton, Text } from "@metro/common/components";
import { ComponentProps } from "react";
import { View } from "react-native";

import { UnifiedPluginModel } from "./models";
import unifyBunnyPlugin from "./models/bunny";
import unifyVdPlugin from "./models/vendetta";

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
            [t("Name (A-Z)")]: (a, b) => a.name.localeCompare(b.name),
            [t("Name (Z-A)")]: (a, b) => b.name.localeCompare(a.name),
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
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

export default function Plugins() {
    useProxy(settings);
    const navigation = NavigationNative.useNavigation();

    return <PluginPage
        useItems={() => {
            useProxy(VdPluginManager.plugins);
            useObservable([pluginSettings]);

            const vdPlugins = Object.values(VdPluginManager.plugins).map(unifyVdPlugin);
            // Core plugins stay hidden, except Endcord's own, which users turn on and off
            const bnPlugins = [...registeredPlugins.values()]
                .filter(p => isPluginInstalled(p.id) && (!isCorePlugin(p.id) || p.extras?.endcord))
                .map(unifyBunnyPlugin);

            return [...bnPlugins, ...vdPlugins].sort(byPopularity);
        }}
        ListHeaderComponent={() => {
            const unproxiedPlugins = Object.values(VdPluginManager.plugins).filter(p => !p.id.startsWith(VD_PROXY_PREFIX) && !p.id.startsWith(BUNNY_PROXY_PREFIX));
            if (!unproxiedPlugins.length) return null;

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
            </View>;
        }}
        ListFooterComponent={() => __DEV__ && (
            <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 16, gap: 12 }}><Button
                size="lg"
                text={t("Browse plugins")}
                icon={findAssetId("CompassIcon")}
                onPress={() => {
                    navigation.push("BUNNY_CUSTOM_PAGE", {
                        title: t("Plugin browser"),
                        render: React.lazy(() => import("../PluginBrowser")),
                    });
                }}
            />
            </View>
        )}
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
    />;
}
