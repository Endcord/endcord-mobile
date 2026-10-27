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

export async function translate(text: string, to: string, from = "auto"): Promise<Translation> {
    const query = [
        ["params.client", "gtx"],
        ["dataTypes", "TRANSLATION"],
        ["key", "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA"],
        ["query.sourceLanguage", from],
        ["query.targetLanguage", to],
        ["query.text", text],
    ].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const res = await fetch(`https://translate-pa.googleapis.com/v1/translate?${query}`);
    if (!res.ok) throw new Error(t("Couldn't translate this ({status})", { status: res.status }));
    const data = await res.json();
    return { from: data.sourceLanguage ?? from, text: data.translation ?? "" };
}
