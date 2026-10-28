import { t } from "@core/i18n";
import { awaitStorage, createFileBackend, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { writeFile } from "@lib/api/native/fs";
import { getStoredTheme, getThemeFilePath, isPyonLoader, isThemeSupported } from "@lib/api/native/loader";
import { awaitStorage as newAwaitStorage } from "@lib/api/storage";
import { Platform } from "react-native";

import initColors from "./colors";
import { applyAndroidAlphaKeys, normalizeToHex } from "./colors/parser";
import { colorsPref } from "./colors/preferences";
import { VendettaThemeManifest } from "./colors/types";
import { updateBunnyColor } from "./colors/updater";

export interface VdThemeInfo {
    id: string;
    selected: boolean;
    data: VendettaThemeManifest;
}

export const themes = wrapSync(createStorage<Record<string, VdThemeInfo>>(createMMKVBackend("VENDETTA_THEMES")));

/**
 * @internal
 */
export async function writeThemeToNative(theme: VdThemeInfo | {}) {
    if (typeof theme !== "object") throw new Error("Theme must be an object");

    // Save the current theme as current-theme.json. When supported by loader,
    // this json will be written to appropriate path and be used to theme the native side.
    await createFileBackend(getThemeFilePath() || "theme.json").set(theme);
}

// Process data for some compatiblity with native side
function processData(data: VendettaThemeManifest) {
    if (data.semanticColors) {
        const { semanticColors } = data;

        for (const key in semanticColors) {
            for (const index in semanticColors[key]) {
                semanticColors[key][index] &&= normalizeToHex(semanticColors[key][index] as string) || false;
            }
        }
    }

    if (data.rawColors) {
        const { rawColors } = data;

        for (const key in rawColors) {
            const normalized = normalizeToHex(rawColors[key]);
            if (normalized) data.rawColors[key] = normalized;
        }

        if (Platform.OS === "android") applyAndroidAlphaKeys(rawColors);
    }

    // this field is required by the spec but vd seems to ignore this
    // so are most vd themes
    data.spec ??= 2;

    return data;
}

function validateTheme(themeJSON: any): boolean {
    if (typeof themeJSON !== "object" || themeJSON === null) return false;
    if (themeJSON.spec !== 2 && themeJSON.spec !== 3) return false;
    if (themeJSON.spec === 3 && !themeJSON.main) return false;

    return true;
}

/** Why a theme couldn't be downloaded: its site couldn't be reached, the file is gone, the site refused, or it isn't a theme */
export class ThemeDownloadError extends Error {
    constructor(readonly kind: "unreachable" | "gone" | "refused" | "invalid", message: string) {
        super(message);
    }
}

const hostOf = (url: string) => url.match(/^\w+:\/\/([^/?#]+)/)?.[1] ?? url;

/** A GitHub file page (github.com/<owner>/<repo>/blob/...) as its raw file, which is what people often paste */
const rawFileUrl = (url: string) => url.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//, "https://raw.githubusercontent.com/$1/$2/");

async function fetchOnce(url: string, timeout: number) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeout);
    try {
        return await fetch(url, { cache: "no-store", signal: abort.signal });
    } finally {
        clearTimeout(timer);
    }
}

/** Downloads a theme and checks it is one, with a reason people can act on when it isn't */
export async function downloadTheme(url: string): Promise<VendettaThemeManifest> {
    const source = rawFileUrl(url);
    let res: Response;
    try {
        res = await fetchOnce(source, 20000);
    } catch {
        // Once more, for a connection that dropped on the way
        try {
            res = await fetchOnce(source, 20000);
        } catch {
            throw new ThemeDownloadError("unreachable", t("Couldn't reach {host}. Check your connection; if it keeps happening, the site the theme is on may be down.", { host: hostOf(source) }));
        }
    }

    if (res.status === 404 || res.status === 410) {
        throw new ThemeDownloadError("gone", t("The theme isn't at this link anymore ({status}). Its author may have moved or deleted it.", { status: res.status }));
    }
    if (!res.ok) throw new ThemeDownloadError("refused", t("{host} didn't send the theme ({status}).", { host: hostOf(source), status: res.status }));

    let themeJSON: any;
    try {
        // trimStart also drops the byte order mark some Windows editors write, which JSON.parse doesn't accept
        themeJSON = JSON.parse((await res.text()).trimStart());
    } catch {
        throw new ThemeDownloadError("invalid", t("This link doesn't lead to a theme file."));
    }
    if (!validateTheme(themeJSON)) throw new ThemeDownloadError("invalid", t("This file isn't a theme Endcord can use."));
    return themeJSON;
}

export async function fetchTheme(url: string, selected = false) {
    const themeJSON = await downloadTheme(url);

    themes[url] = {
        id: url,
        selected: selected,
        data: processData(themeJSON),
    };

    if (selected) {
        writeThemeToNative(themes[url]);
        updateBunnyColor(themes[url].data, { update: true });
    }
}

export async function installTheme(url: string) {
    if (typeof url !== "string" || url in themes) throw new Error("Theme already installed");
    await fetchTheme(url);
}

export function selectTheme(theme: VdThemeInfo | null, write = true) {
    if (theme) theme.selected = true;
    Object.keys(themes).forEach(
        k => themes[k].selected = themes[k].id === theme?.id
    );

    if (theme == null && write) {
        updateBunnyColor(null, { update: true });
        return writeThemeToNative({});
    } else if (theme) {
        updateBunnyColor(theme.data, { update: true });
        return writeThemeToNative(theme);
    }
}

export async function removeTheme(id: string) {
    const theme = themes[id];
    if (theme.selected) await selectTheme(null);
    delete themes[id];

    return theme.selected;
}

export async function updateThemes() {
    await awaitStorage(themes);
    const currentTheme = getThemeFromLoader();
    await Promise.allSettled(Object.keys(themes).map(id => fetchTheme(id, currentTheme?.id === id)));
}

export function getCurrentTheme() {
    return Object.values(themes).find(t => t.selected) ?? null;
}

/**
 * @internal
 */
export function getThemeFromLoader(): VdThemeInfo | null {
    return getStoredTheme();
}

/**
 * @internal
 */
export async function initThemes() {
    if (!isThemeSupported()) return;

    try {
        if (isPyonLoader()) {
            writeFile("../vendetta_theme.json", "null");
        }

        await newAwaitStorage(colorsPref);

        const currentTheme = getThemeFromLoader();
        initColors(currentTheme?.data ?? null);

        updateThemes().catch(e => console.error("Failed to update themes", e));
    } catch (e) {
        console.error("Failed to initialize themes", e);
    }
}
