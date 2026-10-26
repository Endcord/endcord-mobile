import { settings } from "@lib/api/settings";
import { findByNameLazy, findByStoreName } from "@metro/wrappers";
import { NativeModules } from "react-native";
import { PrimitiveType } from "intl-messageformat";

import langDefault from "./default.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ru from "./locales/ru.json";
import tr from "./locales/tr.json";

const IntlMessageFormat = findByNameLazy("MessageFormat") as typeof import("intl-messageformat").default;

export type EndcordLanguage = "en" | "tr" | "ru" | "es" | "fr";

/** The languages Endcord is translated into, the same five as Endcord PC */
export const LANGUAGES: { code: EndcordLanguage; nativeName: string; }[] = [
    { code: "en", nativeName: "English" },
    { code: "tr", nativeName: "Türkçe" },
    { code: "ru", nativeName: "Русский" },
    { code: "es", nativeName: "Español" },
    { code: "fr", nativeName: "Français" },
];

// Built from Endcord PC's translations by scripts/i18n-sync.mjs, keyed by the English text
const tables: Record<Exclude<EndcordLanguage, "en">, Record<string, string>> = { tr, ru, es, fr };

type I18nKey = keyof typeof langDefault;

let localeStore: any = null;
let lastLookup = 0;

/** Discord's language, which follows the phone's unless the user picked another in Discord's settings */
function discordLocale(): string | undefined {
    // Looked up again now and then until Discord has created the store, without searching on every call
    if (!localeStore && Date.now() - lastLookup > 5000) {
        lastLookup = Date.now();
        try {
            localeStore = findByStoreName("LocaleStore") ?? null;
        } catch {
            localeStore = null;
        }
    }
    try {
        const locale = localeStore?.locale ?? localeStore?.getLocale?.();
        if (typeof locale === "string" && locale) return locale;
    } catch { }
    return NativeModules.I18nManager?.localeIdentifier;
}

export function normalizeLanguage(locale?: string | null): EndcordLanguage {
    const code = locale?.toLowerCase().trim() ?? "";
    for (const lang of ["tr", "ru", "es", "fr"] as const) {
        if (code === lang || code.startsWith(`${lang}-`) || code.startsWith(`${lang}_`)) return lang;
    }
    return "en";
}

/** The language Endcord is shown in: the one picked in Endcord's settings, or Discord's own */
export function getLanguage(): EndcordLanguage {
    const picked = settings.language;
    return picked && picked !== "auto" ? picked : normalizeLanguage(discordLocale());
}

/**
 * Translates English text into the current language. `{name}` placeholders are replaced with `vars`.
 * Every literal passed here is picked up by scripts/i18n-sync.mjs, so pass the text itself, not a variable.
 */
export function t(text: string, vars?: Record<string, PrimitiveType>): string {
    const lang = getLanguage();
    let out = lang === "en" ? text : tables[lang][text] ?? text;
    if (vars) out = out.replace(/\{(\w+)\}/g, (match, key) => key in vars ? String(vars[key]) : match);
    return out;
}

/** Marks English text for translation without translating it yet, for values that are translated where shown */
export const tx = (text: string) => text;

export const Strings = new Proxy({}, {
    get: (_t, prop: I18nKey) => t(langDefault[prop] ?? String(prop))
}) as Record<I18nKey, string>;

type FormatStringRet<T> = T extends PrimitiveType ? string : string | T | (string | T)[];

export function formatString<T = void>(key: I18nKey, val: Record<string, T>): FormatStringRet<T> {
    const str = Strings[key];
    // @ts-ignore
    return new IntlMessageFormat(str).format(val);
}

/** @internal */
export function initFetchI18nStrings() {
    // Translations ship in the bundle and the language is read when needed, so there is nothing to load
}
