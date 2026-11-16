/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Adapted from Endcord PC's SecretRingToneEnabler. PC rewrites the 1-in-1000 roll that picks Discord's secret
 * ringtone; the phone app loads its sounds by name through its native sound player, so the usual ringtone is swapped
 * for the secret one (or the Snow Halation theme) as it's loaded. Should this app not have that sound, Discord's own
 * ringtone plays as before. Only the ringing Discord plays itself, while it's open, is changed.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { patchSoundManager } from "../shared/activity";
import { askWithFallback, ringtoneFor } from "./logic";

export default definePlugin({
    id: "endcord.secret-ring-tone",
    name: "SecretRingToneEnabler",
    description: tx("Always play the secret version of the Discord ringtone (except during special ringtone events), for calls that ring while Discord is open"),
    icon: "PhoneCallIcon",
    tags: ["Notifications", "Fun"],
    settings: {
        onlySnow: { type: "boolean", label: tx("Only play the Snow Halation Theme"), default: false },
    },
    start({ store, cleanup, logger }) {
        // Sounds this app turned out not to have, which aren't asked for again
        const missing = new Set<string>();
        cleanup(patchSoundManager("prepare", manager => instead("prepare", manager, (args, orig) => {
            const wanted = ringtoneFor(args[0], store.onlySnow);
            const done = args[3];
            if (!wanted || missing.has(wanted)) return orig(...args);
            // That sound isn't in this app, or the player never answered for it: Discord's own ringtone instead, and it
            // isn't asked for again. This still runs if the plugin stopped meanwhile, as it only asks for Discord's own
            const fallBack = (e: unknown) => {
                missing.add(wanted);
                logger.warn(`this app has no ${wanted} sound, so Discord's usual ringtone plays`, e);
                return orig(...args);
            };
            return askWithFallback(callback => orig(wanted, args[1], args[2], callback, ...args.slice(4)), done, fallBack);
        })));
    },
});
