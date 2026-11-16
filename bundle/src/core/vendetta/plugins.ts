import { stagePluginUpdate } from "@core/addonUpdates";
import { t } from "@core/i18n";
import { confirmRisks, describeRisk, isSerious, newRisks, scanPluginCode } from "@core/pluginScan";
import { awaitStorage, createMMKVBackend, createStorage, purgeStorage, wrapSync } from "@core/vendetta/storage";
import { Author } from "@lib/addons/types";
import { settings } from "@lib/api/settings";
import { safeFetch } from "@lib/utils";
import { requireAddonResponse, requireAddonUrl } from "@lib/utils/addonUrl";
import { BUNNY_PROXY_PREFIX, VD_PROXY_PREFIX } from "@lib/utils/constants";
import { createLogger, logger } from "@lib/utils/logger";
import { MAX_SIZES, readJson, readText } from "@lib/utils/safeFetch";
import { sha256Hex } from "@plugins/crypto";

const SHA256_HEX = /^[0-9a-f]{64}$/i;
const hostOf = (url: string) => url.match(/^\w+:\/\/([^/?#]+)/)?.[1] ?? url;

type EvaledPlugin = {
    onLoad?(): void;
    onUnload(): void;
    settings: React.ComponentType<unknown>;
};

// See https://github.com/vendetta-mod/polymanifest
interface PluginManifest {
    name: string;
    description: string;
    authors: Author[];
    main: string;
    hash: string;
    // Vendor-specific field, contains our own data
    vendetta?: {
        icon?: string;
    };
}

export interface VendettaPlugin {
    id: string;
    manifest: PluginManifest;
    enabled: boolean;
    update: boolean;
    js: string;
}

const plugins = wrapSync(createStorage<Record<string, VendettaPlugin>>(createMMKVBackend("VENDETTA_PLUGINS")));
const pluginInstance: Record<string, EvaledPlugin> = {};

export const VdPluginManager = {
    plugins,
    async pluginFetch(url: string) {
        if (url.startsWith(VD_PROXY_PREFIX)) {
            url = url
                .replace("https://bunny-mod.github.io/plugins-proxy", BUNNY_PROXY_PREFIX)
                .replace(VD_PROXY_PREFIX, BUNNY_PROXY_PREFIX);
        }

        // The code a plugin's link serves runs in Discord, and is fetched again on every start: only over https (or from
        // this machine). A plugin installed over plain http before stays as it is, without updates.
        // Not after a redirect to plain http or into the phone's network either
        return requireAddonResponse(await safeFetch(requireAddonUrl(url), { cache: "no-store" }));
    },

    /**
     * Fetches a plugin's manifest and, when its code changed, the code. With `stage`, new code for a plugin that is
     * running is kept aside until the user says to apply it (core/addonUpdates) instead of replacing it now. With `ask`
     * (fetched by hand: Refetch, Clear data), new code that does what the old didn't is asked about first, as an update
     * the app offers is.
     */
    async fetchPlugin(id: string, { stage = false, ask = false } = {}) {
        if (!id.endsWith("/")) id += "/";
        const existingPlugin = plugins[id];

        let pluginManifest: PluginManifest;

        try {
            pluginManifest = await readJson(await this.pluginFetch(id + "manifest.json"));
        } catch {
            throw new Error(`Failed to fetch manifest for ${id}`);
        }

        let pluginJs: string | undefined;

        if (existingPlugin?.manifest.hash !== pluginManifest.hash) {
            try {
                // by polymanifest spec, plugins should always specify their main file, but just in case
                pluginJs = await readText(await this.pluginFetch(id + (pluginManifest.main || "index.js")), MAX_SIZES.code);
            } catch { } // Empty catch, checked below
        }

        if (!pluginJs && !existingPlugin) throw new Error(`Failed to fetch JS for ${id}`);

        // The manifest carries the SHA-256 of the code it was built with: code that doesn't match it isn't taken
        const expectedHash = String(pluginManifest.hash ?? "").toLowerCase();
        if (pluginJs && SHA256_HEX.test(expectedHash) && sha256Hex(pluginJs) !== expectedHash) {
            throw new Error(`The code served for ${id} doesn't match its manifest`);
        }

        // A plugin's first code is read before it ever runs; the person decides when it does what plugins rarely need
        if (!existingPlugin && pluginJs && !await confirmRisks(pluginManifest.name || id, scanPluginCode(pluginJs))) {
            throw new Error(t("The plugin wasn't installed"));
        }
        if (ask && existingPlugin && pluginJs && pluginJs !== existingPlugin.js
            && !await confirmRisks(pluginManifest.name || id, newRisks(scanPluginCode(existingPlugin.js ?? ""), scanPluginCode(pluginJs)))) {
            throw new Error(t("The update wasn't applied"));
        }

        const next: VendettaPlugin = {
            id: id,
            manifest: pluginManifest,
            enabled: existingPlugin?.enabled ?? false,
            update: existingPlugin?.update ?? true,
            js: pluginJs ?? existingPlugin.js,
        };

        if (stage && existingPlugin?.enabled && pluginJs && pluginJs !== existingPlugin.js) {
            stagePluginUpdate(id, {
                name: pluginManifest.name || existingPlugin.manifest.name || id,
                source: hostOf(id),
                risks: newRisks(scanPluginCode(existingPlugin.js ?? ""), scanPluginCode(pluginJs)).map(describeRisk),
                apply: async () => {
                    // As the plugin is now: removed or turned off since the update came, it stays so
                    const current = plugins[id];
                    if (!current) return;
                    plugins[id] = { ...next, enabled: current.enabled, update: current.update };
                    if (pluginInstance[id]) this.stopPlugin(id, false);
                    if (plugins[id].enabled) await this.startPlugin(id);
                },
            });
            return;
        }

        // A plugin that's off is updated in the background, where nobody sees the update: new code that starts doing
        // what plugins rarely need waits until the plugin is on, when it's offered like any other update
        if (existingPlugin && pluginJs && pluginJs !== existingPlugin.js && !existingPlugin.enabled
            && isSerious(newRisks(scanPluginCode(existingPlugin.js ?? ""), scanPluginCode(pluginJs)))) {
            logger.warn(`The update of ${id} waits until it's turned on: its new code does what plugins rarely need`);
            return;
        }

        plugins[id] = next;
    },

    async installPlugin(id: string, enabled = true) {
        requireAddonUrl(id);
        if (!id.endsWith("/")) id += "/";
        if (id in plugins) throw new Error("Plugin already installed");
        await this.fetchPlugin(id);
        if (enabled) await this.startPlugin(id);
    },

    /**
     * @internal
     */
    async evalPlugin(plugin: VendettaPlugin) {
        const vendettaForPlugins = {
            ...window.vendetta,
            plugin: {
                id: plugin.id,
                manifest: plugin.manifest,
                // Wrapping this with wrapSync is NOT an option.
                storage: await createStorage<Record<string, any>>(createMMKVBackend(plugin.id)),
            },
            logger: createLogger(`Endcord » ${plugin.manifest.name}`),
        };
        const pluginString = `vendetta=>{return ${plugin.js}}\n//# sourceURL=${plugin.id}`;

        const raw = (0, eval)(pluginString)(vendettaForPlugins);
        const ret = typeof raw === "function" ? raw() : raw;
        return ret?.default ?? ret ?? {};
    },

    async startPlugin(id: string) {
        if (!id.endsWith("/")) id += "/";
        const plugin = plugins[id];
        if (!plugin) throw new Error("Attempted to start non-existent plugin");

        try {
            if (settings.safeMode?.enabled !== true) {
                const pluginRet: EvaledPlugin = await this.evalPlugin(plugin);
                pluginInstance[id] = pluginRet;
                pluginRet.onLoad?.();
            }
            plugin.enabled = true;
        } catch (e) {
            logger.error(`Plugin ${plugin.id} errored whilst loading, and will be unloaded`, e);

            try {
                pluginInstance[plugin.id]?.onUnload?.();
            } catch (e2) {
                logger.error(`Plugin ${plugin.id} errored whilst unloading`, e2);
            }

            delete pluginInstance[id];
            plugin.enabled = false;
        }
    },

    stopPlugin(id: string, disable = true) {
        if (!id.endsWith("/")) id += "/";
        const plugin = plugins[id];
        const pluginRet = pluginInstance[id];
        if (!plugin) throw new Error("Attempted to stop non-existent plugin");

        if (settings.safeMode?.enabled !== true) {
            try {
                pluginRet?.onUnload?.();
            } catch (e) {
                logger.error(`Plugin ${plugin.id} errored whilst unloading`, e);
            }

            delete pluginInstance[id];
        }

        if (disable) plugin.enabled = false;
    },

    async removePlugin(id: string) {
        if (!id.endsWith("/")) id += "/";
        const plugin = plugins[id];
        if (plugin.enabled) this.stopPlugin(id);
        delete plugins[id];
        await purgeStorage(id);
    },

    /**
     * @internal
     */
    async initPlugins() {
        await awaitStorage(settings, plugins);
        const allIds = Object.keys(plugins);

        if (settings.safeMode?.enabled !== true) {
            // Loop over any plugin that is enabled, check for its update (new code waits for the user), then start it.
            await Promise.allSettled(allIds.filter(pl => plugins[pl].enabled).map(async pl => (plugins[pl].update && await this.fetchPlugin(pl, { stage: true }).catch((e: Error) => logger.error(e.message)), await this.startPlugin(pl))));
            // Wait for the above to finish, then update all disabled plugins that are allowed to.
            allIds.filter(pl => !plugins[pl].enabled && plugins[pl].update).forEach(pl => this.fetchPlugin(pl));
        }

        return () => this.stopAllPlugins();
    },

    stopAllPlugins() {
        return Object.keys(pluginInstance).forEach(p => this.stopPlugin(p, false));
    },

    getSettings: (id: string) => pluginInstance[id]?.settings
};
