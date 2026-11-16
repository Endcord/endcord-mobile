/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Ported from Endcord PC's NoPushToTalk. PC rewrites PermissionVADStore's code so it always allows voice activity and
 * never warns; the phone app has the same store, so its two answers are patched instead. Anything that asks the
 * store whether you may use voice activity (the voice engine's input mode, the push-to-talk warning) then hears yes.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { getStore } from "../common";

export default definePlugin({
    id: "endcord.no-push-to-talk",
    name: "NoPushToTalk",
    description: tx("Bypasses the push-to-talk requirement for voice activity in channels that enforce it."),
    icon: "VoiceNormalIcon",
    tags: ["Servers", "Voice"],
    start({ cleanup }) {
        const store = getStore("PermissionVADStore");
        if (typeof store?.canUseVoiceActivity !== "function" || typeof store.shouldShowWarning !== "function") {
            throw new Error("Discord's push-to-talk permission check wasn't found");
        }
        cleanup(
            // Last, once the patches are gone (cleanups run last first): what listens to the store reads it again
            () => store.emitChange?.(),
            instead("canUseVoiceActivity", store, () => true),
            instead("shouldShowWarning", store, () => false),
        );
        store.emitChange?.();
    },
});
