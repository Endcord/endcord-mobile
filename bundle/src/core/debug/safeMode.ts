import { getCurrentTheme, writeThemeToNative } from "@lib/addons/themes";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { settings } from "@lib/api/settings";

export function isSafeMode() {
    return settings.safeMode?.enabled === true;
}

export async function toggleSafeMode({
    to = !isSafeMode(),
    reload = true
} = {}) {
    const enabled = (settings.safeMode ??= { enabled: to }).enabled = to;
    // The loaders read the theme as it's stored ({ id, selected, data }): its data alone reads as no theme, which left
    // the theme off after safe mode until it was chosen again
    const currentColor = getCurrentTheme();
    await writeThemeToNative(enabled ? {} : currentColor ?? {});
    if (reload) setTimeout(() => BundleUpdaterManager.reload(), 500);
}
