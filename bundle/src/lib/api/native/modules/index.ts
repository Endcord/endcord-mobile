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

/** The iOS loader's bridge: functions it sets on the global object through JSI, before the bundle runs */
const iosLoaderCall = (globalThis as any).__ENDCORD_LOADER_CALL__ as ((payload: unknown) => any) | undefined;
const iosLoaderCallAsync = (globalThis as any).__ENDCORD_LOADER_CALL_ASYNC__ as ((payload: unknown) => Promise<any>) | undefined;

/**
 * Calls a method the Endcord loader registers on its native bridge. The Android loader answers synchronous calls
 * through react-native-svg's getBBox, which it hooks, and the iOS one through its own global function; a loader
 * without the method answers with an error, which is thrown.
 */
export function callLoaderMethod<T = unknown>(method: string, ...args: unknown[]): T {
    const payload = { revenge: { method, args } };
    const response = iosLoaderCall
        ? iosLoaderCall(payload)
        : getNativeModule("RNSVGRenderableManager")?.getBBox?.(0, payload);
    if (!response || typeof response !== "object") throw new Error(`The loader didn't answer ${method}`);
    if (response.error) throw new Error(String(response.error).split("\n")[0]);
    return response.result as T;
}

/**
 * {@link callLoaderMethod} through the loader's asynchronous path: on Android FileReaderModule's readAsDataURL, which
 * it hooks
 */
export async function callLoaderMethodAsync<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const payload = { revenge: { method, args } };
    let response;
    if (iosLoaderCallAsync) {
        response = await iosLoaderCallAsync(payload);
    } else {
        const reader = getNativeModule("FileReaderModule");
        if (typeof reader?.readAsDataURL !== "function") throw new Error(`The loader didn't answer ${method}`);
        response = await reader.readAsDataURL(payload);
    }
    if (!response || typeof response !== "object") throw new Error(`The loader didn't answer ${method}`);
    if (response.error) throw new Error(String(response.error).split("\n")[0]);
    return response.result as T;
}
