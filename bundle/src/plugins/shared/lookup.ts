/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Commands that look something up, on Discord or the web, and Translate.
 *
 * What more than one of the AvatarGrabber, ServerInfo, FriendInvites and Translate plugins uses.
 */

import { t } from "@core/i18n";
import safeFetch, { readJson } from "@lib/utils/safeFetch";

export const CDN = "https://cdn.discordapp.com";

export const unix = (ms: number) => Math.floor(ms / 1000);

export function avatarUrl(user: any, size = 1024): string {
    if (user?.avatar) {
        const ext = user.avatar.startsWith("a_") ? "gif" : "png";
        return `${CDN}/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
    }
    const index = user?.discriminator && user.discriminator !== "0"
        ? Number(user.discriminator) % 5
        : Math.floor(Number(user?.id ?? 0) / 4194304) % 6;
    return `${CDN}/embed/avatars/${index}.png`;
}

export interface Translation {
    from: string;
    text: string;
}

/** How long Google Translate is waited for: messages that are translated before they're sent wait on it */
const TRANSLATE_TIMEOUT = 15_000;
/** The most an answer may weigh: a message's translation, many times over */
const MAX_TRANSLATION_BYTES = 1024 * 1024;

/** Google Translate's translation; throws when there is none, so what was to be translated can be kept as it was */
export async function translate(text: string, to: string, from = "auto"): Promise<Translation> {
    const query = [
        ["params.client", "gtx"],
        ["dataTypes", "TRANSLATION"],
        ["key", "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA"],
        ["query.sourceLanguage", from],
        ["query.targetLanguage", to],
        ["query.text", text],
    ].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    let res: Response;
    try {
        res = await safeFetch(`https://translate-pa.googleapis.com/v1/translate?${query}`, undefined, TRANSLATE_TIMEOUT);
    } catch (e) {
        const status = Number(/non-ok: (\d{3})/.exec(String((e as Error)?.message ?? e))?.[1]);
        if (status) throw new Error(t("Couldn't translate this ({status})", { status }));
        throw e;
    }
    const data = await readJson(res, MAX_TRANSLATION_BYTES);
    // An answer without one isn't a translation into nothing
    if (typeof data?.translation !== "string" || (text.trim() && !data.translation.trim())) {
        throw new Error(t("Couldn't translate this ({status})", { status: res.status }));
    }
    return { from: typeof data.sourceLanguage === "string" ? data.sourceLanguage : from, text: data.translation };
}
