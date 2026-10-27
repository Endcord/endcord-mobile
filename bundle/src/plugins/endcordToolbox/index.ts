/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { toggleSafeMode } from "@core/debug/safeMode";
import { t, tx } from "@core/i18n";
import { disablePlugin, isPluginEnabled } from "@lib/addons/plugins";
import { findAssetId } from "@lib/api/assets";
import { getDebugInfo } from "@lib/api/debug";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getToolboxActions } from "../common";
import { command, copy } from "../hooks";
import { manifest } from "../manifest";
import { BUTTON_OPTIONS, chatButton, failed } from "../shared/navigation";
import { choose } from "../ui/dialogs";

function toolbox() {
    // Other plugins' entries, such as CustomProfile's
    const extra = getToolboxActions();
    choose(t("Endcord Toolbox"), [
        { label: t("Reload Discord"), value: "reload", icon: "RetryIcon" },
        { label: t("Turn Off a Plugin…"), value: "plugins", icon: "PuzzlePieceIcon" },
        { label: t("Copy Debug Info"), value: "debug", icon: "CopyIcon" },
        ...extra.map((a, i) => ({ label: a.label(), value: `extra-${i}`, icon: a.icon })),
        { label: t("Restart in Safe Mode"), value: "safe", icon: "ShieldIcon", danger: true },
    ], action => {
        if (action.startsWith("extra-")) {
            const result = extra[Number(action.slice("extra-".length))]?.run();
            if (result instanceof Promise) result.catch(failed);
        } else if (action === "reload") BundleUpdaterManager.reload();
        else if (action === "safe") toggleSafeMode({ to: true });
        else if (action === "debug") {
            const info = getDebugInfo() as any;
            const enabled = manifest.filter(p => isPluginEnabled(p.id)).length;
            copy([
                `Endcord ${info.bunny?.version ?? "?"}`,
                `Discord ${info.discord?.version ?? "?"} (${info.discord?.build ?? "?"})`,
                `${info.os?.name ?? "Android"} ${info.os?.version ?? ""} · ${info.device?.manufacturer ?? ""} ${info.device?.model ?? ""}`.trim(),
                `Hermes ${info.hermes?.version ?? "?"}`,
                `${t("Plugins on")}: ${enabled}`,
            ].join("\n"));
        } else {
            const on = manifest.filter(p => isPluginEnabled(p.id));
            if (!on.length) return showToast(t("No Endcord plugins are on"), findAssetId("PuzzlePieceIcon"));
            choose(t("Turn Off a Plugin…"), on.map(p => ({ label: p.name, value: p.id })), id => {
                disablePlugin(id);
                showToast(t("{plugin} is off", { plugin: manifest.find(p => p.id === id)?.name ?? id }), findAssetId("PuzzlePieceIcon"));
            });
        }
    });
}

export default definePlugin({
    id: "endcord.endcord-toolbox",
    name: "EndcordToolbox",
    description: tx("Adds a button beside the message box with Endcord quick actions: reload, turn off plugins, debug info and safe mode"),
    authors: [ENDCORD_AUTHOR],
    icon: "WrenchIcon",
    tags: ["Utility"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "right", options: BUTTON_OPTIONS },
    },
    start({ store, cleanup }) {
        cleanup(
            command({ name: "toolbox", description: tx("Open Endcord's quick actions"), run: toolbox }),
            chatButton("endcord-toolbox", store, "WrenchIcon", () => t("Endcord Toolbox"), toolbox),
        );
    },
});
