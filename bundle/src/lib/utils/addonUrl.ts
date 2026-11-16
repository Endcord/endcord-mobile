import { t } from "@core/i18n";
import { isPrivateUrl } from "@lib/utils/publicAddress";

/**
 * Plain http:// is only for a developer's own machine, where a plugin or font is served while it's written: localhost,
 * and 10.0.2.2, which is the machine as the Android emulator sees it. Anything else on the way could change what's served.
 */
const OWN_MACHINE = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.0\.2\.2)(:\d+)?(\/|$)/i;

/**
 * Whether an addon (a plugin, theme or font) may be downloaded from a link: over https, or http from this machine. A
 * plugin is code that runs in Discord and a font goes to the system's font parser, so whoever can change them on the
 * way, like anyone on the same Wi-Fi with plain http, mustn't be able to. An https link may not point into the phone or
 * its network either, as on Endcord PC: such links come in messages and in backups other people made.
 */
export function isAddonUrl(url: unknown): url is string {
    if (typeof url !== "string") return false;
    if (OWN_MACHINE.test(url)) return true;
    return /^https:\/\/\S+$/i.test(url) && !isPrivateUrl(url);
}

/** The link an addon may be downloaded from, or throws with the reason to show */
export function requireAddonUrl(url: unknown): string {
    if (isAddonUrl(url)) return url;
    throw new Error(t("Addons can only be installed from an https:// link"));
}

/**
 * The response, unless it came from somewhere an addon may not: a link that redirected to plain http, or into the phone
 * or its network
 */
export function requireAddonResponse<T extends { url?: string; }>(res: T): T {
    if (res.url && !isAddonUrl(res.url)) throw new Error(t("Addons can only be installed from an https:// link"));
    return res;
}
