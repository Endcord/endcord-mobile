import { RNModules } from "./types";

const nmp = window.nativeModuleProxy;

/** The first of these native modules the app has, as a TurboModule or a legacy native module */
export function getNativeModule<T = any>(...names: string[]): T | undefined {
    for (const name of names) {
        if (globalThis.__turboModuleProxy) {
            const module = globalThis.__turboModuleProxy(name);
            if (module) return module as T;
        }

        if (nmp[name]) return nmp[name] as T;
    }

    return undefined;
}

export const NativeCacheModule = getNativeModule<RNModules.MMKVManager>(
    "NativeCacheModule", "MMKVManager"
)!;
export const NativeFileModule = getNativeModule<RNModules.FileManager>(
    "NativeFileModule", "RTNFileManager", "DCDFileManager"
)!;
export const NativeClientInfoModule = getNativeModule<RNModules.ClientInfoModule>(
    "NativeClientInfoModule", "RTNClientInfoManager", "InfoDictionaryManager"
)!;
export const NativeDeviceModule = getNativeModule(
    "NativeDeviceModule", "RTNDeviceManager", "DCDDeviceManager"
)!;
export const NativeThemeModule = getNativeModule(
    "NativeThemeModule", "RTNThemeManager", "DCDTheme"
)!;
export const BundleUpdaterManager = getNativeModule(
    "BundleUpdaterManager"
)!;

/**
 * Calls a method the Endcord loader registers on its native bridge. The loader answers synchronous calls through
 * react-native-svg's getBBox, which it hooks; a loader without the method answers with an error, which is thrown.
 */
export function callLoaderMethod<T = unknown>(method: string, ...args: unknown[]): T {
    const response = getNativeModule("RNSVGRenderableManager")?.getBBox?.(0, { revenge: { method, args } });
    if (!response || typeof response !== "object") throw new Error(`The loader didn't answer ${method}`);
    if (response.error) throw new Error(String(response.error).split("\n")[0]);
    return response.result as T;
}

/** {@link callLoaderMethod} through the loader's asynchronous path, FileReaderModule's readAsDataURL, which it hooks */
export async function callLoaderMethodAsync<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const reader = getNativeModule("FileReaderModule");
    if (typeof reader?.readAsDataURL !== "function") throw new Error(`The loader didn't answer ${method}`);
    const response = await reader.readAsDataURL({ revenge: { method, args } });
    if (!response || typeof response !== "object") throw new Error(`The loader didn't answer ${method}`);
    if (response.error) throw new Error(String(response.error).split("\n")[0]);
    return response.result as T;
}
