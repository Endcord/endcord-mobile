import { createFileBackend, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { getLoaderConfigPath } from "@lib/api/native/loader";

export interface Settings {
    debuggerUrl: string;
    enableAutoDebugger?: boolean;
    developerSettings: boolean;
    enableDiscordDeveloperSettings: boolean;
    safeMode?: {
        enabled: boolean;
        currentThemeId?: string;
    };
    enableEvalCommand?: boolean;
    /** "auto" (or unset) follows Discord's language */
    language?: "auto" | import("@core/i18n").EndcordLanguage;
}

export interface LoaderConfig {
    customLoadUrl: {
        enabled: boolean;
        url: string;
    };
    loadReactDevTools: boolean;
}

export const settings = wrapSync(createStorage<Settings>(createMMKVBackend("VENDETTA_SETTINGS")));

export const loaderConfig = wrapSync(createStorage<LoaderConfig>(
    createFileBackend(getLoaderConfigPath(), {
        customLoadUrl: {
            enabled: false,
            url: "http://localhost:4040/revenge.js"
        }
    })
));

/** Holds on Discord's developer-only features (Experiments) other than the user's own setting */
const developerHolds = new Set<symbol>();

/** Turns Discord's developer-only features on until the returned function is called, leaving the user's setting as is */
export function holdDiscordDeveloper(): () => void {
    const hold = Symbol("developer");
    developerHolds.add(hold);
    return () => void developerHolds.delete(hold);
}

/** Whether Discord's developer-only features are on: by the user's setting or while something holds them on */
export const isDiscordDeveloper = () => Boolean(settings.enableDiscordDeveloperSettings) || developerHolds.size > 0;
