/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's other translation services, which a phone can reach directly (PC goes through its desktop side only
 * because a browser page can't): DeepL, with your API key, and Kagi, with your session token. Their language codes
 * aren't Google's, so the ones you type are turned into theirs.
 */

import { t } from "@core/i18n";
import safeFetch, { readJson, readText } from "@lib/utils/safeFetch";

import type { Translation } from "../shared/lookup";

const TIMEOUT = 15_000;
const MAX_REPLY = 1024 * 1024;

export type Service = "google" | "deepl" | "deepl-pro" | "kagi";

/** DeepL's quota is used up: PC goes back to Google Translate then */
export class QuotaError extends Error { }

/** A language code as DeepL takes it for what to translate to: it has no plain English, Portuguese or Chinese */
export function deeplTarget(code: string): string {
    const lower = code.trim().toLowerCase();
    switch (lower) {
        case "en": return "en-us";
        case "pt": return "pt-br";
        case "zh": case "zh-cn": return "zh-hans";
        case "zh-tw": return "zh-hant";
        case "no": return "nb";
        case "iw": return "he";
        default: return lower;
    }
}

/** A language a service named, shown as a code in capitals, or as the name it gave */
export function languageLabel(from: string): string {
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(from) ? from.toUpperCase() : from;
}

/** The status a reply came back with, from safeFetch's error for one that wasn't OK */
const statusOf = (e: unknown) => Number(/non-ok: (\d{3})/.exec(String((e as Error)?.message ?? e))?.[1]) || undefined;

export async function deeplTranslate(text: string, to: string, apiKey: string, pro: boolean): Promise<Translation> {
    const url = pro ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate";
    let res: Response;
    try {
        res = await safeFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `DeepL-Auth-Key ${apiKey}` },
            body: JSON.stringify({ text: [text], target_lang: deeplTarget(to) }),
        }, TIMEOUT);
    } catch (e) {
        const status = statusOf(e);
        if (status === 456) throw new QuotaError("DeepL API quota exceeded");
        if (status === 403) throw new Error(t("Invalid DeepL API key or version"));
        if (status) throw new Error(t("Couldn't translate this ({status})", { status }));
        throw e;
    }
    const data = await readJson(res, MAX_REPLY);
    const first = data?.translations?.[0];
    if (typeof first?.text !== "string") throw new Error(t("Couldn't translate this ({status})", { status: res.status }));
    return { from: typeof first.detected_source_language === "string" ? first.detected_source_language : "auto", text: first.text };
}

export async function kagiTranslate(text: string, to: string, session: string): Promise<Translation> {
    let res: Response;
    try {
        res = await safeFetch("https://translate.kagi.com/api/translate", {
            method: "POST",
            // The token goes as written: the app's own cookies for Kagi, if it got any, would take its place
            credentials: "omit",
            headers: { "Content-Type": "application/json", "Cookie": `kagi_session=${session}` },
            body: JSON.stringify({ text, from: "auto", to: to.trim().toLowerCase(), model: "standard" }),
        }, TIMEOUT);
    } catch (e) {
        const status = statusOf(e);
        if (status === 401) throw new Error(t("Invalid or expired Kagi session token"));
        if (status) throw new Error(t("Couldn't translate this ({status})", { status }));
        throw e;
    }
    const raw = await readText(res, MAX_REPLY);
    let data: any;
    try {
        data = JSON.parse(raw);
    } catch {
        data = undefined;
    }
    if (typeof data?.translation !== "string") throw new Error(t("Couldn't translate this ({status})", { status: res.status }));
    const label = data.detected_language?.label;
    return { from: typeof label === "string" && label ? label.slice(0, 40) : "auto", text: data.translation };
}

/** Whether a key or token can go in a request header as it is: one line of plain characters */
export const isHeaderSafe = (value: string) => /^[\x21-\x7e]{1,512}$/.test(value);
