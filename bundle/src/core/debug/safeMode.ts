import { confirmStart } from "@core/debug/bootGuard";
import { getCurrentTheme, getThemeFromLoader, selectTheme, themes, writeThemeToNative } from "@lib/addons/themes";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { settings } from "@lib/api/settings";
import { flushStorages } from "@lib/api/storage";

export function isSafeMode() {
    return settings.safeMode?.enabled === true;
}

/**
 * Puts the safe mode setting in the shape everything reads it in. The settings file is anyone's to edit: "enabled": 1
 * would be on for some checks and off for others, and a setting that isn't an object would make leaving safe mode throw
 */
export function normalizeSafeModeSetting() {
    const current = settings.safeMode as unknown;
    if (current === undefined) return;
    const isObject = !!current && typeof current === "object" && !Array.isArray(current);
    const value = isObject ? current as Record<string, unknown> : {};
    if (isObject && typeof value.enabled === "boolean") return;
    settings.safeMode = {
        enabled: value.enabled === true,
        ...typeof value.currentThemeId === "string" ? { currentThemeId: value.currentThemeId } : {},
        ...value.fromCrashes === true ? { fromCrashes: true } : {},
    };
}

/** The theme that comes back after safe mode: the one on now, kept in the settings, which outlive a restart */
export function rememberThemeForSafeMode() {
    const id = getCurrentTheme()?.id ?? getThemeFromLoader()?.id;
    if (id && settings.safeMode) settings.safeMode.currentThemeId = id;
}

export async function toggleSafeMode({
    to = !isSafeMode(),
    reload = true
} = {}) {
    normalizeSafeModeSetting();
    const enabled = (settings.safeMode ??= { enabled: to }).enabled = to;
    if (enabled) {
        rememberThemeForSafeMode();
        // The loaders read the theme as it's stored ({ id, selected, data }): its data alone reads as no theme
        await writeThemeToNative({});
    } else {
        delete settings.safeMode.fromCrashes;
        // A start in safe mode marks every theme as not selected, since the loader had none: the one kept when safe
        // mode came on is the one to put back, unless it was turned off from the Themes page meanwhile
        const remembered = settings.safeMode.currentThemeId;
        const theme = getCurrentTheme() ?? (remembered ? themes[remembered] : undefined);
        if (theme) await selectTheme(theme);
        else await writeThemeToNative({});
    }
    // Chosen, not a crash: this start doesn't count as a failed one, though it says nothing about the plugins
    await confirmStart(null);
    if (reload) {
        // Plugins turned off just before, from the safe mode notice, are saved a moment later otherwise
        await flushStorages().catch(e => console.error("[Endcord] Couldn't save the storages before reloading", e));
        setTimeout(() => BundleUpdaterManager.reload(), 500);
    }
}
