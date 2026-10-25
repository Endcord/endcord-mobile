import { Strings, t } from "@core/i18n";
import { isCorePlugin, refreshPlugin, registeredPlugins, uninstallPlugin } from "@lib/addons/plugins";
import { findAssetId } from "@lib/api/assets";
import { hideSheet } from "@lib/ui/sheets";
import { showToast } from "@lib/ui/toasts";
import { clipboard } from "@metro/common";
import { ActionSheet, Card, IconButton, Text } from "@metro/common/components";
import { ComponentProps } from "react";
import { ScrollView, View } from "react-native";

import { PluginInfoActionSheetProps } from "./common";
import TitleComponent from "./TitleComponent";

function PluginInfoIconButton(props: ComponentProps<typeof IconButton>) {
    const { onPress } = props;
    props.onPress &&= () => {
        hideSheet("PluginInfoActionSheet");
        onPress?.();
    };

    return <IconButton {...props} />;
}

export default function PluginInfoActionSheet({ plugin, navigation }: PluginInfoActionSheetProps) {
    plugin.usePluginState();

    const manifest: any = registeredPlugins.get(plugin.id);
    // Plugins installed from a repository can be updated and removed; built-in ones can't
    const external = !isCorePlugin(plugin.id) && manifest?.parentRepository;
    const SettingsComponent = plugin.getPluginSettingsComponent();

    return <ActionSheet>
        <ScrollView contentContainerStyle={{ gap: 12, marginBottom: 12 }}>
            <View style={{ paddingVertical: 24 }}>
                <TitleComponent plugin={plugin} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-around", alignContent: "center" }}>
                <PluginInfoIconButton
                    label={t("Settings")}
                    variant="secondary"
                    disabled={!SettingsComponent}
                    icon={findAssetId("WrenchIcon")}
                    onPress={() => navigation.push("BUNNY_CUSTOM_PAGE", {
                        title: plugin.name,
                        render: SettingsComponent,
                    })}
                />
                {external && <PluginInfoIconButton
                    label={Strings.REFETCH}
                    variant="secondary"
                    icon={findAssetId("RetryIcon")}
                    onPress={() => {
                        refreshPlugin(plugin.id)
                            .then(() => showToast(Strings.PLUGIN_REFETCH_SUCCESSFUL, findAssetId("toast_image_saved")))
                            .catch(() => showToast(Strings.PLUGIN_REFETCH_FAILED, findAssetId("Small")));
                    }}
                />}
                {external && <PluginInfoIconButton
                    label={Strings.COPY_URL}
                    variant="secondary"
                    icon={findAssetId("LinkIcon")}
                    onPress={() => {
                        clipboard.setString(manifest.parentRepository);
                        showToast.showCopyToClipboard();
                    }}
                />}
                {external && <PluginInfoIconButton
                    label={Strings.UNINSTALL}
                    variant="destructive"
                    icon={findAssetId("TrashIcon")}
                    onPress={() => {
                        uninstallPlugin(plugin.id)
                            .catch(e => showToast(String(e), findAssetId("CircleXIcon-primary")));
                    }}
                />}
            </View>
            {!!plugin.description && <Card>
                <Text variant="text-md/semibold" color="text-strong" style={{ marginBottom: 4 }}>
                    {t("Description")}
                </Text>
                <Text variant="text-md/medium">
                    {plugin.description}
                </Text>
            </Card>}
        </ScrollView>
    </ActionSheet>;
}
