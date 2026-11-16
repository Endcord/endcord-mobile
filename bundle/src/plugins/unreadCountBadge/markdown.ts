/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Other people's text as /unread's answer should show it: that answer draws markdown, so a group DM's name or someone's
 * display name could otherwise show as a link to anywhere, a mention or formatting. Each character markdown, links and
 * mentions are written with gets a backslash, which Discord shows as the character itself, and the text stays on one
 * line.
 */
export function escapeMarkdown(text: unknown): string {
    return String(text ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/[\\*_~|`>[\]()<#@:-]/g, "\\$&");
}
