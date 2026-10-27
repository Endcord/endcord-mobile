/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins about your account and the app itself: server tags, focus time, profile presets, startup timings, logs.
 *
 * What the ProfileSets and EventLogs plugins both use.
 */



export const preview = (text: string, length = 80) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};
