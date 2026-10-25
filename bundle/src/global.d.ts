declare global {
    type React = typeof import("react");

    // ReactNative/Hermes globals
    var globalEvalWithSourceUrl: (script: string, sourceURL: string) => any;
    var nativePerformanceNow: typeof performance.now;
    var nativeModuleProxy: Record<string, any>;
    /** True in bundles built with --test for the emulator workflow */
    var __ENDCORD_TEST__: boolean;
    var __turboModuleProxy: (name: string) => any;

    interface Window {
        [key: string]: any;
        vendetta: any;
        bunny: typeof import("@lib");
    }
}

export { };
