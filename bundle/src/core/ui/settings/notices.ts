/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";

/** The one-time notices the user has dismissed; one storage for all of them, so saving one can't overwrite another */
export const notices = wrapSync(createStorage<{
    aliucordDismissed?: boolean;
    /** Read what installing a plugin from the community means, before the first one */
    communityPluginsAcknowledged?: boolean;
}>(createMMKVBackend("ENDCORD_NOTICES", {})));
