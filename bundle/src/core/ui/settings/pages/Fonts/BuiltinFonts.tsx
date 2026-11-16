/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The font packs Endcord suggests, above the installed fonts: one tap downloads one and uses it. Once downloaded, a pack
 * is an installed font like any other, in the list below.
 */

import { Strings, t } from "@core/i18n";
import { showConfirmationAlert } from "@core/vendetta/alerts";
import { useProxy } from "@core/vendetta/storage";
import { fonts, saveFont } from "@lib/addons/fonts";
import { BUILTIN_FONTS } from "@lib/addons/fonts/builtin";
import { findAssetId } from "@lib/api/assets";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { showToast } from "@lib/ui/toasts";
import { Button, Card, Stack, Text } from "@metro/common/components";
import { useState } from "react";
import { View } from "react-native";

export default function BuiltinFonts() {
    useProxy(fonts);
    const [busy, setBusy] = useState<string | null>(null);
    const available = BUILTIN_FONTS.filter(font => !(font.definition.name in fonts));
    if (!available.length) return null;

    const install = async (name: string) => {
        const font = BUILTIN_FONTS.find(f => f.definition.name === name);
        if (!font || busy) return;
        setBusy(name);
        try {
            // A copy: what's saved is the user's to edit, the list here stays as it is
            await saveFont({ ...font.definition, main: { ...font.definition.main } }, true);
            showConfirmationAlert({
                title: Strings.HOLD_UP,
                content: t("Reload Discord to apply changes?"),
                confirmText: Strings.RELOAD,
                cancelText: Strings.CANCEL,
                confirmColor: "red",
                onConfirm: BundleUpdaterManager.reload,
            });
        } catch (e) {
            console.error(`[Endcord] Couldn't download the font ${name}`, e);
            showToast(t("Couldn't download {name}. Check your connection and try again.", { name }), findAssetId("CircleXIcon-primary"));
        } finally {
            setBusy(null);
        }
    };

    return <View style={{ gap: 8, marginBottom: 12 }}>
        <Text variant="heading-md/semibold">{t("Suggested fonts")}</Text>
        {available.map(({ definition, description }) => <Card key={definition.name}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Stack spacing={2} style={{ flex: 1 }}>
                    <Text variant="text-md/semibold">{definition.name}</Text>
                    <Text variant="text-sm/medium" color="text-muted">{t(description)}</Text>
                </Stack>
                <Button
                    size="sm"
                    variant="primary"
                    text={t("Use")}
                    loading={busy === definition.name}
                    disabled={busy != null}
                    onPress={() => void install(definition.name)}
                />
            </View>
        </Card>)}
        <Text variant="text-xs/medium" color="text-muted">{t("Free, openly licensed fonts from Google Fonts. Each is downloaded once, then works offline.")}</Text>
    </View>;
}
