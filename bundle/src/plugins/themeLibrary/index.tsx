/*
 * Endcord for Android
 * SPDX-License-Identifier: GPL-3.0-or-later
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
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, View } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";

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

const plugin = definePlugin({
    id: "endcord.theme-library",
    name: "ThemeLibrary",
    description: tx("Browse and install themes for Discord on your phone without leaving the app."),
    authors: [ENDCORD_AUTHOR],
    popular: 7,
    icon: "PaintPaletteIcon",
    start() { },
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

function ThemeRow({ theme }: { theme: LibraryTheme; }) {
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
            showToast(t("Couldn't install the theme: {error}", { error: e instanceof Error ? e.message : String(e) }), findAssetId("CircleXIcon-primary"));
        } finally {
            setBusy(false);
        }
    };

    return <Card>
        <Stack spacing={10}>
            {theme.previewUrl && <Image
                source={{ uri: theme.previewUrl }}
                style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 8 }}
                resizeMode="cover"
            />}
            <View>
                <Text variant="heading-md/semibold">{theme.name}</Text>
                {!!theme.authors?.length && <Text variant="text-sm/medium" color="text-muted">
                    {t("by {authors}", { authors: theme.authors.join(", ") })}
                </Text>}
            </View>
            {!!theme.description && <Text variant="text-md/medium">{t(theme.description)}</Text>}
            <Button
                text={applied ? t("Applied") : entry ? t("Apply") : t("Install")}
                variant={applied ? "secondary" : "primary"}
                size="md"
                disabled={applied}
                loading={busy}
                onPress={apply}
            />
        </Stack>
    </Card>;
}

function Library() {
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

    return <Stack spacing={12}>
        <Text variant="text-sm/medium" color="text-muted">
            {t("Themes from the community's theme marketplace and Catppuccin. Installed themes also appear in Endcord's Themes page.")}
        </Text>
        {catppuccin.map(theme => <ThemeRow key={theme.installUrl} theme={theme} />)}
        {list === null && <ActivityIndicator style={{ marginVertical: 24 }} />}
        {failed && <Text variant="text-md/medium" color="text-danger">{t("Couldn't load the theme list. Check your connection and try again.")}</Text>}
        {list?.map(theme => <ThemeRow key={theme.installUrl} theme={theme} />)}
    </Stack>;
}

export default plugin;
