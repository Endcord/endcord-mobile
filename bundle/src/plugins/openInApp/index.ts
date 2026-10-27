/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";
import { findByProps } from "@metro";
import { Linking } from "react-native";

import { definePlugin } from "../api";
import { appLink } from "../shared/navigation";

export default definePlugin({
    id: "endcord.open-in-app",
    name: "OpenInApp",
    description: tx("Open links in their respective apps instead of your browser"),
    icon: "LinkExternalSmallIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const openApp = Linking.openURL.bind(Linking);
        const targets = new Set([Linking, findByProps("openURLExternally")].filter(Boolean));
        for (const target of targets) {
            for (const key of ["openURL", "openURLExternally"]) {
                if (typeof target[key] !== "function") continue;
                cleanup(instead(key, target, (args, orig) => {
                    const app = typeof args[0] === "string" ? appLink(args[0]) : undefined;
                    // Without the app installed, the link opens as it always did
                    return app ? openApp(app).catch(() => orig(...args)) : orig(...args);
                }));
            }
        }
    },
});
