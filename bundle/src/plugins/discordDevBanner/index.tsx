/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";
import { addOverlay } from "@core/overlay";
import { NativeClientInfoModule } from "@lib/api/native/modules";
import { Text } from "@metro/common/components";
import { version } from "bunny-build-info";
import { View } from "react-native";

import { definePlugin } from "../api";

function Banner() {
    const info = NativeClientInfoModule.getConstants();
    return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" }}>
        <View style={{ backgroundColor: "rgba(88,101,242,0.85)", paddingHorizontal: 8, paddingVertical: 1, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }}>
            <Text variant="text-xxs/semibold" style={{ color: "white" }}>Discord {info.Version} ({info.Build}) · Endcord {version.split("-")[0]}</Text>
        </View>
    </View>;
}

export default definePlugin({
    id: "endcord.discord-dev-banner",
    name: "DiscordDevBanner",
    description: tx("Enables Discord's developer banner, which shows the build ID"),
    icon: "WrenchIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addOverlay("discord-dev-banner", Banner));
    },
});
