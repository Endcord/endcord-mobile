/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord's own themes, above the installed ones: a row of swatches, each the theme's background with its accent, one
 * tap to use it. Discord's own colors come first, as the main theme: what Endcord starts with, and one tap away from any
 * other. Nothing to download.
 */

import { t } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { fetchTheme, getCurrentTheme, selectTheme, themes } from "@lib/addons/themes";
import { builtinThemes } from "@lib/addons/themes/builtin";
import { findAssetId } from "@lib/api/assets";
import { settings } from "@lib/api/settings";
import { showToast } from "@lib/ui/toasts";
import { Text } from "@metro/common/components";
import { semanticColors } from "@ui/color";
import { createStyles } from "@ui/styles";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

/** The tile for Discord's own colors, which is no theme: its key, and what its swatch shows (Discord's dark theme) */
const DISCORD = "discord";
const DISCORD_BACKGROUND = "#313338";
const DISCORD_BLURPLE = "#5865f2";

const useStyles = createStyles({
    row: {
        gap: 10,
        paddingVertical: 4,
        paddingHorizontal: 2,
    },
    tile: {
        width: 112,
        borderRadius: 14,
        padding: 6,
        gap: 6,
        borderWidth: 2,
        borderColor: "transparent",
        backgroundColor: semanticColors.CARD_SECONDARY_BG,
    },
    selected: {
        borderColor: semanticColors.TEXT_BRAND,
    },
    swatch: {
        height: 64,
        borderRadius: 10,
        padding: 8,
        gap: 5,
        overflow: "hidden",
    },
    line: {
        height: 5,
        borderRadius: 3,
        opacity: 0.85,
    },
    dot: {
        position: "absolute",
        right: 8,
        bottom: 8,
        width: 18,
        height: 18,
        borderRadius: 9,
    },
});

export default function BuiltinThemes() {
    useProxy(themes);
    useProxy(settings);
    const styles = useStyles();
    const list = useMemo(builtinThemes, []);
    const [busy, setBusy] = useState<string | null>(null);
    // In safe mode no theme applies, Endcord's own included
    const disabled = Boolean(settings.safeMode?.enabled);

    // Discord's own colors: no theme at all, which is what Endcord starts with
    const usingDiscord = !getCurrentTheme();

    const pick = async (id: string | null) => {
        if (busy || disabled) return;
        setBusy(id ?? DISCORD);
        try {
            if (id === null || themes[id]?.selected) {
                if (!getCurrentTheme()) return;
                await selectTheme(null);
            } else {
                // Made again from the code each time, so it's the newest version of it
                await fetchTheme(id);
                await selectTheme(themes[id]);
            }
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), findAssetId("CircleXIcon-primary"));
        } finally {
            setBusy(null);
        }
    };

    return <View style={{ gap: 8, marginBottom: 12 }}>
        <Text variant="heading-md/semibold">{t("Endcord themes")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            <Pressable
                key={DISCORD}
                onPress={() => void pick(null)}
                disabled={disabled}
                accessibilityRole="radio"
                accessibilityState={{ selected: usingDiscord, disabled, busy: busy === DISCORD }}
                accessibilityLabel={`Discord. ${t("Discord's own colors, as Discord has them. The main theme.")}`}
                style={({ pressed }) => [styles.tile, usingDiscord && styles.selected, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}
            >
                <View style={[styles.swatch, { backgroundColor: DISCORD_BACKGROUND }]}>
                    <View style={[styles.line, { width: "70%", backgroundColor: "#f2f3f5" }]} />
                    <View style={[styles.line, { width: "45%", backgroundColor: "#f2f3f5", opacity: 0.45 }]} />
                    <View style={[styles.line, { width: "55%", backgroundColor: DISCORD_BLURPLE }]} />
                    <View style={[styles.dot, { backgroundColor: DISCORD_BLURPLE }]} />
                </View>
                <Text variant="text-sm/semibold" lineClamp={1}>Discord</Text>
            </Pressable>
            {list.map(theme => {
                const selected = Boolean(themes[theme.id]?.selected);
                return <Pressable
                    key={theme.id}
                    onPress={() => void pick(theme.id)}
                    disabled={disabled}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled, busy: busy === theme.id }}
                    accessibilityLabel={`${theme.name}. ${t(theme.description)}`}
                    style={({ pressed }) => [styles.tile, selected && styles.selected, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}
                >
                    <View style={[styles.swatch, { backgroundColor: theme.background }]}>
                        <View style={[styles.line, { width: "70%", backgroundColor: "#f3f6fb" }]} />
                        <View style={[styles.line, { width: "45%", backgroundColor: "#f3f6fb", opacity: 0.45 }]} />
                        <View style={[styles.line, { width: "55%", backgroundColor: theme.accent }]} />
                        <View style={[styles.dot, { backgroundColor: theme.accent }]} />
                    </View>
                    <Text variant="text-sm/semibold" lineClamp={1}>{theme.name}</Text>
                </Pressable>;
            })}
        </ScrollView>
        <Text variant="text-xs/medium" color="text-muted">
            {t("Discord's own colors are the main theme. The others are Endcord's own and Endcord PC's Theme Studio colors, made for dark and light.")}
        </Text>
    </View>;
}
