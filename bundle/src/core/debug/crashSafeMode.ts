/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * What the boot guard (bootGuard.ts) does about failed starts: safe mode, and a notice naming the plugins turned on
 * since Discord last came up, with a way to turn them off and start normally again.
 */

import { t } from "@core/i18n";
import { showConfirmationAlert } from "@core/vendetta/alerts";
import { VdPluginManager } from "@core/vendetta/plugins";
import { disablePlugin, isPluginEnabled, registeredPlugins, SAFE_MODE_PLUGINS } from "@lib/addons/plugins";
import { writeThemeToNative } from "@lib/addons/themes";
import { settings } from "@lib/api/settings";

import { type BootState, suspectsOf } from "./bootGuard";
import { rememberThemeForSafeMode, toggleSafeMode } from "./safeMode";

/** Vendetta plugins are kept by their link, so they're told apart from the others in the boot record */
const VENDETTA = "vendetta:";

/** The plugins someone turned on themselves: not the ones safe mode keeps, nor the link installer Endcord needs */
export function enabledPluginIds(): string[] {
    const ids = [...registeredPlugins.keys()].filter(id => isPluginEnabled(id) && !SAFE_MODE_PLUGINS.has(id) && id !== "bunny.quickinstall");
    for (const [id, plugin] of Object.entries<any>(VdPluginManager.plugins ?? {})) {
        if (plugin?.enabled) ids.push(VENDETTA + id);
    }
    return ids;
}

function nameOf(id: string): string {
    if (id.startsWith(VENDETTA)) return (VdPluginManager.plugins as any)?.[id.slice(VENDETTA.length)]?.manifest?.name ?? id.slice(VENDETTA.length);
    return registeredPlugins.get(id)?.display?.name ?? id;
}

function turnOff(id: string) {
    try {
        if (id.startsWith(VENDETTA)) VdPluginManager.stopPlugin(id.slice(VENDETTA.length), true);
        else if (registeredPlugins.has(id)) disablePlugin(id);
    } catch (e) {
        console.error(`[Endcord] ${id} couldn't be turned off`, e);
    }
}

/** Safe mode from this start on, until the person leaves it: no reload, since no plugin has run yet */
export async function enterSafeModeAfterCrashes() {
    settings.safeMode = { ...settings.safeMode, enabled: true, fromCrashes: true };
    // Comes back when safe mode is left
    rememberThemeForSafeMode();
    // The loader applies the theme before Endcord runs; from the next start on, none
    await writeThemeToNative({});
}

/** Says why Discord started in safe mode, once Discord can show it */
export function showCrashSafeModeNotice(state: BootState) {
    let suspects: string[] = [];
    try {
        suspects = state.lastGood.length ? suspectsOf(state, enabledPluginIds()) : [];
    } catch (e) {
        console.error("[Endcord] The plugins turned on since the last good start couldn't be listed", e);
    }
    const count = state.failedStarts;
    if (suspects.length) {
        showConfirmationAlert({
            title: t("Endcord started in safe mode"),
            content: t("Discord didn't open properly {count} times in a row, so Endcord started with its plugins and themes off. These plugins were turned on since it last opened properly:\n\n{plugins}\n\nTurn them off and start normally again?", {
                count,
                plugins: suspects.map(id => `• ${nameOf(id)}`).join("\n"),
            }),
            confirmText: t("Turn them off and restart"),
            cancelText: t("Not now"),
            onConfirm: () => {
                for (const id of suspects) turnOff(id);
                toggleSafeMode({ to: false }).catch(e => console.error("[Endcord] Couldn't leave safe mode", e));
            },
        });
    } else {
        showConfirmationAlert({
            title: t("Endcord started in safe mode"),
            content: t("Discord didn't open properly {count} times in a row, so Endcord started with its plugins and themes off. No plugin was turned on since it last opened properly; one that updated may be the cause. Leave safe mode from Endcord's General page when you're ready.", { count }),
            confirmText: t("OK"),
            onConfirm: () => { },
        });
    }
}
