/*
 * Medslol for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * New code for plugins that are already running isn't swapped in behind the user's back: it is kept aside, and once
 * the repositories have answered the user is asked, once for all of them, whether to apply it. Whoever serves a
 * plugin can change what it does; this keeps that from being silent.
 */

import { t } from "@core/i18n";
import { showConfirmationAlert } from "@core/vendetta/alerts";

export interface PendingPluginUpdate {
    name: string;
    /** Where the code came from, for the user to recognise */
    source: string;
    apply: () => Promise<void> | void;
}

const pending = new Map<string, PendingPluginUpdate>();
let askTimer: ReturnType<typeof setTimeout> | undefined;

/** Keeps a plugin's new code aside; the ask comes a moment after the last one, so one alert covers them all */
export function stagePluginUpdate(id: string, update: PendingPluginUpdate) {
    pending.set(id, update);
    clearTimeout(askTimer);
    askTimer = setTimeout(askToApply, 4000);
}

/** The plugins whose new code is waiting, for the UI */
export function pendingPluginUpdates(): ReadonlyMap<string, PendingPluginUpdate> {
    return pending;
}

async function applyAll() {
    const updates = [...pending.entries()];
    pending.clear();
    for (const [id, update] of updates) {
        try {
            await update.apply();
        } catch (e) {
            console.error(`[Medslol] Couldn't apply the update of ${id}`, e);
        }
    }
}

function askToApply() {
    if (!pending.size) return;
    const list = [...pending.values()].map(u => `• ${u.name} (${u.source})`).join("\n");
    showConfirmationAlert({
        title: t("Plugin updates"),
        content: t("New code was downloaded for these plugins. It runs in Discord with everything your account can do, so only apply updates you expect:\n\n{list}", { list }),
        confirmText: t("Apply updates"),
        cancelText: t("Not now"),
        onConfirm: () => void applyAll(),
        // Declined code stays out; the repositories offer it again on the next start
        onCancel: () => pending.clear(),
    });
}
