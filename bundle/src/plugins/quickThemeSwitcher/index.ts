/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage } from "@core/vendetta/storage";
import { getCurrentTheme, selectTheme, themes } from "@lib/addons/themes";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { command } from "../hooks";
import { BUTTON_OPTIONS, chatButton, failed } from "../shared/navigation";
import { choose } from "../ui/dialogs";

function pickTheme() {
    const installed = Object.values(themes);
    const current = getCurrentTheme()?.id;
    choose(t("Theme"), [
        { label: `${current ? "" : "✓ "}${t("Default")}`, value: "" },
        ...installed.map(theme => ({ label: `${theme.id === current ? "✓ " : ""}${theme.data?.name ?? theme.id}`, value: theme.id })),
    ], id => {
        Promise.resolve(selectTheme(id ? themes[id] : null)).catch(failed);
        showToast(t("Theme changed; some colors change after a restart"), findAssetId("PaintPaletteIcon"));
    });
}

export default definePlugin({
    id: "endcord.quick-theme-switcher",
    name: "QuickThemeSwitcher",
    description: tx("Switch between your installed themes with /theme or a button beside the message box"),
    icon: "PaintPaletteIcon",
    tags: ["Appearance"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "none", options: BUTTON_OPTIONS },
    },
    async start({ store, cleanup }) {
        await awaitStorage(themes);
        cleanup(
            command({ name: "theme", description: tx("Switch to another installed theme"), run: pickTheme }),
            chatButton("quick-theme-switcher", store, "PaintPaletteIcon", () => t("Theme"), pickTheme),
        );
    },
});
