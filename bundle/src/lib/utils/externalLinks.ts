/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's one check for links that come from themes, messages, remote lists and settings (src/shared/
 * externalLinks.ts there), for the phone: an intent:, file: or content: link could start any app or open the app's own
 * files, so only these open. Written without URL, which React Native only partly implements.
 */

import { Linking } from "react-native";

/** A web link, or an email address to write to */
export const isSafeLink = (url: unknown): url is string => typeof url === "string" && /^(?:https?:\/\/[^\s/?#\\]+|mailto:[^\s]+)/i.test(url.trim()) && !/[\0-\x1f\x7f]/.test(url);

/** Only a web link */
export const isWebLink = (url: unknown): url is string => typeof url === "string" && /^https?:\/\/[^\s/?#\\]+/i.test(url.trim()) && !/[\0-\x1f\x7f]/.test(url);

/** Opens a link from elsewhere when it's a safe one; resolves to whether it was opened */
export async function openSafeLink(url: unknown): Promise<boolean> {
    if (!isSafeLink(url)) return false;
    // eslint-disable-next-line no-restricted-syntax -- this is the check
    await Linking.openURL(url.trim());
    return true;
}
