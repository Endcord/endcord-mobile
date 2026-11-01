import { t } from "@core/i18n";

/**
 * Plain http:// is only for a developer's own machine, where a plugin or font is served while it's written: localhost,
 * and 10.0.2.2, which is the machine as the Android emulator sees it. Anything else on the way could change what's served.
 */
const OWN_MACHINE = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.0\.2\.2)(:\d+)?(\/|$)/i;

/**
 * Whether an addon (a plugin, theme or font) may be downloaded from a link: over https, or http from this machine. A
 * plugin is code that runs in Discord and a font goes to the system's font parser, so whoever can change them on the
 * way, like anyone on the same Wi-Fi with plain http, mustn't be able to.
 */
export function isAddonUrl(url: unknown): url is string {
    return typeof url === "string" && (/^https:\/\/\S+$/i.test(url) || OWN_MACHINE.test(url));
}

/** The link an addon may be downloaded from, or throws with the reason to show */
export function requireAddonUrl(url: unknown): string {
    if (isAddonUrl(url)) return url;
    throw new Error(t("Addons can only be installed from an https:// link"));
}
