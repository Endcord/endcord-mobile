/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's NoTrack: Discord's analytics, metrics and crash reports aren't collected or sent. The loader already
 * blocks the native crash reporters; this covers what Discord's own code reports.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";
import { findByPropsLazy } from "@metro";
import { patchWhenLoaded } from "@metro/lazy";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { onAction } from "../common";

// Patched when Discord loads them, so this plugin loads nothing early
const Analytics = findByPropsLazy("AnalyticsActionHandlers", "trackMaker");
const NetworkAnalytics = findByPropsLazy("trackNetworkAction");
const Impressions = findByPropsLazy("trackImpression");
const VoiceAnalytics = findByPropsLazy("trackWithMetadata", "getVoiceStateMetadata");
const Metrics = findByPropsLazy("_metrics", "_intervalId");
const SentryInit = findByPropsLazy("initSentry");
const Sentry = findByPropsLazy("profiledRootComponent", "addBreadcrumb");
const HTTP = findByPropsLazy("HTTP", "getAPIBaseURL");

/** Where Discord uploads analytics events and metrics, with or without the API version in front */
const TELEMETRY = /^(?:\/api(?:\/v\d+)?)?\/(?:science|metrics(?:\/v2)?)\/?$/;

const noop = () => { };

interface TrackAction {
    /** Called once the event is sent, by Discord's handler that this plugin stands in for */
    resolve?(): void;
}

/** Replaces the module's functions that exist with ones that do nothing; the rest may be gone from this Discord */
const silence = (module: any, keys: string[]) => keys
    .filter(key => typeof module?.[key] === "function")
    .map(key => instead(key, module, noop));

export default definePlugin({
    id: "endcord.no-track",
    name: "NoTrack",
    description: tx("Stops Discord from collecting analytics, metrics and crash reports about how you use the app"),
    authors: [ENDCORD_AUTHOR],
    icon: "AnalyticsIcon",
    tags: ["Privacy"],
    enabledByDefault: true,
    start({ cleanup }) {
        const silenceWhenLoaded = (module: any, keys: string[]) => patchWhenLoaded(module, loaded => {
            const unpatches = silence(loaded, keys);
            return () => unpatches.forEach(unpatch => unpatch());
        });

        cleanup(
            silenceWhenLoaded(Analytics, ["track"]),
            patchWhenLoaded(Analytics, ({ AnalyticsActionHandlers: handlers }) => {
                const unpatches = silence(handlers, ["handleTrack", "handleFingerprint"]);
                return () => unpatches.forEach(unpatch => unpatch());
            }),
            silenceWhenLoaded(NetworkAnalytics, ["trackNetworkAction"]),
            // Only the function: the module's default is a hook, which must keep calling the same hooks while mounted
            silenceWhenLoaded(Impressions, ["trackImpression"]),
            silenceWhenLoaded(VoiceAnalytics, ["trackWithMetadata"]),
            silenceWhenLoaded(Metrics, ["increment", "distribution"]),
            // Who you are and what you did, kept for crash reports
            silenceWhenLoaded(SentryInit, ["initSentry"]),
            silenceWhenLoaded(Sentry, ["addBreadcrumb", "setUser", "setTags", "setExtra"]),
            // Anything else that still reaches the upload endpoints is answered here instead of being sent
            patchWhenLoaded(HTTP, http => {
                const unpatches = [http.HTTP, http].map(client => instead("post", client, (args, orig) => {
                    const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
                    if (typeof url === "string" && TELEMETRY.test(url)) return Promise.resolve({ ok: true, status: 204, headers: {}, body: null });
                    return orig(...args);
                }));
                return () => unpatches.forEach(unpatch => unpatch());
            }),
            // Some of Discord waits for a tracked event to be sent before going on
            onAction<TrackAction>("TRACK", action => {
                action.resolve?.();
                return false;
            }),
        );
    },
});
