import { Strings } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { toasts } from "@metro/common";
import { ComponentType, createElement } from "react";
import { Image } from "react-native";

let counter = 0;

// Discord's toasts take an icon component; assets are drawn with Image, in the size and color the toast gives
const iconComponents = new Map<number, ComponentType<any>>();
function iconFor(asset?: number) {
    if (asset == null) return undefined;
    let icon = iconComponents.get(asset);
    if (!icon) {
        icon = ({ style }: { style?: any; }) => createElement(Image, { source: asset, style: [{ width: 20, height: 20 }, style] });
        iconComponents.set(asset, icon);
    }
    return icon;
}

/**
 * Shows one of Discord's toasts. Since Discord 2xx toasts are opened as open(key, { text, icon }); passing a single
 * object, as older Vendetta code did, makes Discord's toast container crash the whole app.
 */
export const showToast = (content: string, asset?: number) => {
    try {
        toasts.open(`endcord-toast-${Date.now()}-${counter++}`, {
            text: content,
            icon: iconFor(asset),
        });
    } catch (e) {
        console.error("[Endcord] couldn't show a toast", e);
    }
};

showToast.showCopyToClipboard = (message = Strings.COPIED_TO_CLIPBOARD) => {
    showToast(message, findAssetId("LinkIcon"));
};
