import patchErrorBoundary from "@core/debug/patches/patchErrorBoundary";
import initFixes from "@core/fixes";
import { initFetchI18nStrings } from "@core/i18n";
import { initOverlayHost } from "@core/overlay";
import { markReady, step } from "@core/timings";
import initSettings from "@core/ui/settings";
import { initVendettaObject } from "@core/vendetta/api";
import { VdPluginManager } from "@core/vendetta/plugins";
import { updateFonts } from "@lib/addons/fonts";
import { initPlugins, updatePlugins } from "@lib/addons/plugins";
import { initThemes } from "@lib/addons/themes";
import { patchCommands } from "@lib/api/commands";
import { initDebugger } from "@lib/api/debug";
import { injectFluxInterceptor } from "@lib/api/flux";
import { patchJsx } from "@lib/api/react/jsx";
import { logger } from "@lib/utils/logger";
import { patchSettings } from "@ui/settings";

import * as lib from "./lib";

export default async () => {
    // Before Discord registers its root component, which happens as soon as Endcord has loaded
    const unpatchOverlay = initOverlayHost();
    if (unpatchOverlay) lib.unload.push(unpatchOverlay);

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
};
