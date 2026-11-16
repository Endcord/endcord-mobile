/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Changes to lists Discord gives in more than one shape.
 */

/**
 * Applies a change to a list of DMs, which Discord gives flat (getPrivateChannelIds: channel IDs) or in sections
 * (Discord 353's getSortedChannels: the favorites, then the others, each a list of { channelId, ... }). Each section
 * is changed on its own, so nothing moves from one to another. The same list comes back when nothing changed, so
 * Discord doesn't draw it again for nothing.
 */
export function bySection<T>(list: T, change: (items: any[]) => any[]): T {
    if (!Array.isArray(list)) return list;
    if (!list.length || !list.every(Array.isArray)) return change(list) as T;
    let changed = false;
    const sections = list.map(section => {
        const next = change(section);
        if (next !== section) changed = true;
        return next;
    });
    return (changed ? sections : list) as T;
}
