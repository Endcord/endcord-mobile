declare global {
    type React = typeof import("react");

    // ReactNative/Hermes globals
    var globalEvalWithSourceUrl: (script: string, sourceURL: string) => any;
    var nativePerformanceNow: typeof performance.now;
    var nativeModuleProxy: Record<string, any>;
    /** True in bundles built with --test for the emulator workflow */
    var __ENDCORD_TEST__: boolean;
    /** The branch this build is published to, which the update check reads: --builds-branch, builds-next by default */
    var __BUILDS_BRANCH__: string;
    var __turboModuleProxy: (name: string) => any;

    interface Window {
        [key: string]: any;
        vendetta: any;
        bunny: typeof import("@lib");
    }
}

export { };
