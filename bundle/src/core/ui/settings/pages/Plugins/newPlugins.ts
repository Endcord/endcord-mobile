/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { useEffect, useState } from "react";

/** When each plugin was first seen, like Endcord PC's "existing plugins" list */
const firstSeen = wrapSync(createStorage<Record<string, number>>(createMMKVBackend("ENDCORD_PLUGINS_FIRST_SEEN")));

const NEW_FOR = 2 * 24 * 60 * 60 * 1000;

/** Plugins that arrived in the last two days, for the "new" badge and filter. A first run has none. */
export function useNewPlugins(ids: string[]): Set<string> {
    const [result, setResult] = useState<Set<string>>(() => new Set());
    const key = ids.join(",");

    useEffect(() => {
        let cancelled = false;
        awaitStorage(firstSeen).then(() => {
            const now = Date.now();
            const known = Object.keys(firstSeen).length > 0;
            const fresh = new Set<string>();
            for (const id of ids) {
                // The plugins there on the first run are the baseline, never new
                const seen = firstSeen[id] ??= known ? now : 0;
                if (now - seen < NEW_FOR) fresh.add(id);
            }
            if (!cancelled) setResult(fresh);
        });
        return () => void (cancelled = true);
    }, [key]);

    return result;
}
