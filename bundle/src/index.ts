import { startBootGuard, watchForStableStart } from "@core/debug/bootGuard";
import { enabledPluginIds, enterSafeModeAfterCrashes, showCrashSafeModeNotice } from "@core/debug/crashSafeMode";
import patchErrorBoundary from "@core/debug/patches/patchErrorBoundary";
import { isSafeMode, normalizeSafeModeSetting } from "@core/debug/safeMode";
import initFixes from "@core/fixes";
import { initFetchI18nStrings } from "@core/i18n";
import { initOverlayHost } from "@core/overlay";
import { takeDailySnapshot } from "@core/snapshots";
import { markReady, step } from "@core/timings";
import initSettings from "@core/ui/settings";
import { initVendettaObject } from "@core/vendetta/api";
import { VdPluginManager } from "@core/vendetta/plugins";
import { awaitStorage } from "@core/vendetta/storage";
import { updateFonts } from "@lib/addons/fonts";
import { initPlugins, updatePlugins } from "@lib/addons/plugins";
import { initThemes } from "@lib/addons/themes";
import { patchCommands } from "@lib/api/commands";
import { initDebugger } from "@lib/api/debug";
import { injectFluxInterceptor } from "@lib/api/flux";
import { patchJsx } from "@lib/api/react/jsx";
import { settings } from "@lib/api/settings";
import { logger } from "@lib/utils/logger";
import { patchSettings } from "@ui/settings";

import * as lib from "./lib";

export default async () => {
    // Before Discord registers its root component, which happens as soon as Endcord has loaded
    const unpatchOverlay = initOverlayHost();
    if (unpatchOverlay) lib.unload.push(unpatchOverlay);

    // Counted before any plugin or theme runs: three starts in a row that don't come up mean safe mode
    await awaitStorage(settings);
    normalizeSafeModeSetting();
    const boot = await startBootGuard(isSafeMode);
    if (boot.safeModeFromCrashes) await enterSafeModeAfterCrashes().catch(e => logger.error("Couldn't turn safe mode on", e));

    // Load everything in parallel; Discord's start waits for all of it, so each step's time is kept for StartupTimings
    await Promise.all([
        step("themes", initThemes),
        step("flux", injectFluxInterceptor),
        step("settings", patchSettings),
        step("commands", patchCommands),
        step("jsx", patchJsx),
        step("vendetta", initVendettaObject),
        step("i18n", initFetchI18nStrings),
        step("settingsPages", initSettings),
        step("fixes", initFixes),
        step("errorBoundary", patchErrorBoundary),
        step("plugins", updatePlugins),
    ]).then(
        // Push them all to unloader
        u => u.forEach(f => f && lib.unload.push(f))
    );

    // Assign window object
    window.bunny = lib;

    // Start debugger
    initDebugger();

    // Once done, load Vendetta plugins
    VdPluginManager.initPlugins()
        .then(u => lib.unload.push(u))
        .catch(() => alert("Failed to initialize Vendetta plugins"));

    // And then, load Bunny plugins
    initPlugins();

    // Update the fonts
    updateFonts();

    if (__ENDCORD_TEST__) require("@core/debug/testHarness").initTestHarness();

    markReady();
    logger.log("Endcord is ready!");

    // The start counts as one that came up once Discord stays up; with the plugins on then, outside safe mode
    watchForStableStart(() => isSafeMode() ? null : enabledPluginIds(), () => {
        // Settings that came up fine are the ones worth going back to
        if (!isSafeMode()) takeDailySnapshot().catch(e => logger.error("Couldn't keep today's copy of the settings", e));
    });
    // After Discord has drawn its first screen, where an alert can show
    if (boot.safeModeFromCrashes) setTimeout(() => {
        try {
            showCrashSafeModeNotice(boot);
        } catch (e) {
            logger.error("Couldn't say why Endcord started in safe mode", e);
        }
    }, 5000);
};
