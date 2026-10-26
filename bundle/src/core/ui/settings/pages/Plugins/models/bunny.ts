import { t } from "@core/i18n";
import { PyoncordIcon } from "@core/ui/settings";
import { disablePlugin, enablePlugin, getPluginSettingsComponent, isPluginEnabled, pluginSettings } from "@lib/addons/plugins";
import { BunnyPluginManifest } from "@lib/addons/plugins/types";
import { findAssetId } from "@lib/api/assets";
import { useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";

import { UnifiedPluginModel } from ".";

export default function unifyBunnyPlugin(manifest: BunnyPluginManifest): UnifiedPluginModel {
    return {
        id: manifest.id,
        name: manifest.display.name,
        // Endcord's plugins carry English text that is translated where it is shown
        description: manifest.extras?.endcord ? t(manifest.display.description ?? "") : manifest.display.description,
        authors: manifest.display.authors,
        icon: manifest.extras?.icon,
        endcord: !!manifest.extras?.endcord,
        popular: manifest.extras?.popular,
        tags: manifest.extras?.tags,

        getBadges() {
            return [{ source: { uri: PyoncordIcon } }];
        },
        isEnabled: () => isPluginEnabled(manifest.id),
        isInstalled: () => manifest.id in pluginSettings,
        usePluginState() {
            useObservable([pluginSettings]);
        },
        toggle(start: boolean) {
            try {
                if (start) {
                    enablePlugin(manifest.id, true).catch(e => {
                        console.error(e);
                        showToast(t("{name} couldn't start and was turned off", { name: manifest.display.name }), findAssetId("CircleXIcon-primary"));
                    });
                } else {
                    disablePlugin(manifest.id);
                }
            } catch (e) {
                console.error(e);
            }
        },
        resolveSheetComponent() {
            return import("../sheets/PluginInfoActionSheet");
        },
        getPluginSettingsComponent() {
            return getPluginSettingsComponent(manifest.id);
        },
    };
}
