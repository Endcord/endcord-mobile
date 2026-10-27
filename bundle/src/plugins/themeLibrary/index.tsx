/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ThemeLibrary: a page of themes to browse and install, in Endcord's settings and EndcordToolbox.
 */

import { t, tx } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { installTheme, selectTheme, themes } from "@lib/addons/themes";
import { findAssetId } from "@lib/api/assets";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { openAlert } from "@lib/ui/alerts";
import { showToast } from "@lib/ui/toasts";
import { safeFetch } from "@lib/utils";
import { AlertActionButton, AlertActions, AlertModal, Button, Card, Stack, Text } from "@metro/common/components";
import { semanticColorOf } from "@ui/color";
import { Search } from "@ui/components";
import { createStyles } from "@ui/styles";
import { memo, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, ScrollView, View } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addSettingsPage, addToolboxAction } from "../common";
import { describeError } from "../hooks";
import { openPage } from "../ui/pages";

const useStyles = createStyles({
    preview: { width: "100%", aspectRatio: 16 / 9, borderRadius: 8 },
    // Themes from the marketplace often have no preview; the same space keeps the cards of a row alike
    noPreview: {
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: semanticColorOf("BACKGROUND_MOD_SUBTLE", "BACKGROUND_MOD_NORMAL", "BACKGROUND_BASE_LOW"),
    },
    noPreviewIcon: { width: 40, height: 40, tintColor: semanticColorOf("TEXT_MUTED", "INTERACTIVE_NORMAL") },
});

interface LibraryTheme {
    name: string;
    description?: string;
    authors?: string[];
    installUrl: string;
    previewUrl?: string;
}

// A community-run list of mobile themes, checked by its maintainers
const MARKETPLACE = "https://raw.githubusercontent.com/kmmiio99o/theme-marketplace/main/themes.json";
const CATPPUCCIN = "https://raw.githubusercontent.com/catppuccin/vendetta/main/themes";

const catppuccin: LibraryTheme[] = [
    ["mocha", "Mocha"], ["macchiato", "Macchiato"], ["frappe", "Frappé"], ["latte", "Latte"]
].map(([id, name]) => ({
    name: `Catppuccin ${name}`,
    description: tx("Soothing pastel theme for the high-spirited!"),
    authors: ["Catppuccin"],
    installUrl: `${CATPPUCCIN}/${id}/mauve.json`,
    previewUrl: `https://raw.githubusercontent.com/catppuccin/vendetta/main/assets/${id}.webp`,
}));

// Cards share the row out evenly, never narrower than this, so a tablet shows a few side by side
const MIN_CARD_WIDTH = 300;
const GAP = 12;

const plugin = definePlugin({
    id: "endcord.theme-library",
    name: "ThemeLibrary",
    description: tx("Browse and install themes for Discord on your phone without leaving the app."),
    authors: [ENDCORD_AUTHOR],
    popular: 7,
    icon: "PaintPaletteIcon",
    tags: ["Appearance", "Customisation"],
    start({ cleanup }) {
        cleanup(
            addSettingsPage("theme-library", { title: () => t("Theme Library"), icon: "PaintbrushThinIcon", Page: LibraryPage, after: "BUNNY_THEMES" }),
            addToolboxAction("theme-library", { label: () => t("Open Theme Library"), icon: "PaintbrushThinIcon", run: () => openPage(t("Theme Library"), LibraryPage) }),
        );
    },
    SettingsComponent: Library,
});

function promptReload() {
    openAlert("endcord-theme-library-reload", <AlertModal
        title={t("Restart required")}
        content={t("Reload the app to fully apply changes")}
        actions={<AlertActions>
            <AlertActionButton text={t("Restart now")} variant="primary" onPress={() => BundleUpdaterManager.reload()} />
            <AlertActionButton text={t("Later")} variant="secondary" />
        </AlertActions>}
    />);
}

const ThemeCard = memo(function ThemeCard({ theme, width }: { theme: LibraryTheme; width: number; }) {
    const styles = useStyles();
    const installed = useProxy(themes);
    const [busy, setBusy] = useState(false);
    const entry = installed[theme.installUrl];
    const applied = !!entry?.selected;

    const apply = async () => {
        setBusy(true);
        try {
            if (!entry) await installTheme(theme.installUrl);
            await selectTheme(themes[theme.installUrl]);
            showToast(t("Theme applied"), findAssetId("CheckmarkLargeIcon"));
            promptReload();
        } catch (e) {
            showToast(t("Couldn't install the theme: {error}", { error: describeError(e) }), findAssetId("CircleXIcon-primary"));
        } finally {
            setBusy(false);
        }
    };

    return <Card style={{ width, justifyContent: "space-between", gap: 10 }}>
        <Stack spacing={10}>
            {theme.previewUrl ? <Image
                source={{ uri: theme.previewUrl }}
                style={styles.preview}
                resizeMode="cover"
                // The previews are full-size screenshots; decoded at the card's size they don't hold up scrolling
                resizeMethod="resize"
            /> : <View style={[styles.preview, styles.noPreview]}>
                <Image source={findAssetId("PaintPaletteIcon")!} style={styles.noPreviewIcon} />
            </View>}
            <View>
                <Text variant="heading-md/semibold">{theme.name}</Text>
                {!!theme.authors?.length && <Text variant="text-sm/medium" color="text-muted">
                    {t("by {authors}", { authors: theme.authors.join(", ") })}
                </Text>}
            </View>
            {!!theme.description && <Text variant="text-md/medium">{t(theme.description)}</Text>}
        </Stack>
        <Button
            text={applied ? t("Applied") : entry ? t("Apply") : t("Install")}
            variant={applied ? "secondary" : "primary"}
            size="md"
            disabled={applied}
            loading={busy}
            onPress={apply}
        />
    </Card>;
});

function useMarketplace() {
    const [list, setList] = useState<LibraryTheme[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        safeFetch(MARKETPLACE, { cache: "no-store" })
            .then(r => r.json())
            .then((items: any[]) => setList(items
                .filter(i => typeof i?.name === "string" && /^https:\/\//.test(i?.installUrl))
                .map(i => ({
                    name: i.name,
                    description: i.description,
                    authors: Array.isArray(i.authors) ? i.authors.map((a: any) => typeof a === "string" ? a : a?.name).filter(Boolean) : undefined,
                    installUrl: i.installUrl,
                    previewUrl: typeof i.previewUrl === "string" ? i.previewUrl : typeof i.preview === "string" ? i.preview : undefined,
                }))))
            .catch(() => {
                setFailed(true);
                setList([]);
            });
    }, []);

    return { list, failed };
}

/** The library: Catppuccin's themes, then the marketplace's, searchable by name, author and description */
function Library() {
    const { list, failed } = useMarketplace();
    const [query, setQuery] = useState("");
    const [width, setWidth] = useState(0);
    const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
    const cardWidth = (width - GAP * (columns - 1)) / columns;

    const shown = useMemo(() => {
        const all = [...catppuccin, ...list ?? []];
        const q = query.trim().toLowerCase();
        if (!q) return all;
        return all.filter(theme => [theme.name, theme.description && t(theme.description), ...theme.authors ?? []]
            .some(text => text?.toLowerCase().includes(q)));
    }, [list, query]);

    return <Stack spacing={12}>
        <Text variant="text-sm/medium" color="text-muted">
            {t("Themes from the community's theme marketplace and Catppuccin. Installed themes also appear in Endcord's Themes page.")}
        </Text>
        <Search placeholder={t("Search for a theme...")} onChangeText={setQuery} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
            {width > 0 && shown.map(theme => <ThemeCard key={theme.installUrl} theme={theme} width={cardWidth} />)}
        </View>
        {list === null && <ActivityIndicator style={{ marginVertical: 24 }} />}
        {list !== null && !shown.length && <Text variant="text-md/medium" color="text-muted" style={{ textAlign: "center" }}>{t("No results")}</Text>}
        {failed && <Text variant="text-md/medium" color="text-feedback-critical">{t("Couldn't load the theme list. Check your connection and try again.")}</Text>}
    </Stack>;
}

function LibraryPage() {
    return <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 38 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Library />
    </ScrollView>;
}

export default plugin;
