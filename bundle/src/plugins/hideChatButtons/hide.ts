/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Which of the buttons left of the message box HideChatButtons leaves out, without Discord.
 */

/** Whether an element, or one it's made of, is one of these components */
export function uses(element: any, types: Set<unknown>, depth = 0): boolean {
    if (!element || typeof element !== "object" || depth > 4) return false;
    if (Array.isArray(element)) return element.some(child => uses(child, types, depth + 1));
    if (types.has(element.type) || types.has(element.type?.type)) return true;
    return uses(element.props?.children, types, depth + 1);
}

/** The row's buttons without the hidden ones: other plugins' buttons and Discord's own of `discordTypes` */
export function shownButtons(children: readonly any[], discordTypes: Set<unknown>, toggleKey: string): any[] {
    return children.filter(child => {
        const key = typeof child?.key === "string" ? child.key : "";
        if (key === toggleKey) return true;
        if (key.startsWith("endcord-")) return false;
        return !uses(child, discordTypes);
    });
}
