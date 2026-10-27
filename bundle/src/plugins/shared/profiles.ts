/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Profile plugins: avatars, banners, badges and theme colors from the services Endcord PC uses.
 *
 * What more than one of the UserPFP, USRBG and GlobalBadges plugins uses.
 */

import { getStore } from "../common";
import { redrawChannel } from "../hooks";

/** What shows avatars, banners and badges draws them again, after the data for them loaded */
export function redrawProfiles() {
    for (const name of ["UserStore", "UserProfileStore"]) {
        try {
            getStore(name)?.emitChange?.();
        } catch { }
    }
    redrawChannel();
}
