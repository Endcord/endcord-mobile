/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { Button, Stack } from "@metro/common/components";

import { definePlugin } from "../api";
import { toastError } from "../hooks";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

interface StatusPreset {
    text: string;
    emojiName?: string;
    emojiId?: string;
    status?: string;
}

const presets = wrapSync(createStorage<{ items: StatusPreset[]; }>(createMMKVBackend("ENDCORD_STATUS_PRESETS", { items: [] })));

const presetList = () => Array.isArray(presets.items) ? presets.items : [];

function statusSettings() {
    return findByProps("CustomStatusSetting", "StatusSetting") ?? findByProps("CustomStatusSetting");
}

function applyPreset(preset: StatusPreset) {
    const settings = statusSettings();
    if (!settings?.CustomStatusSetting) throw new Error("Discord's status settings weren't found");
    settings.CustomStatusSetting.updateSetting({ text: preset.text, emojiName: preset.emojiName ?? "", emojiId: preset.emojiId ?? "0", expiresAtMs: "0" });
    if (preset.status) settings.StatusSetting?.updateSetting?.(preset.status);
}

function StatusPresetsPage() {
    useProxy(presets);
    const save = () => {
        const current = statusSettings()?.CustomStatusSetting?.getSetting?.();
        const status = statusSettings()?.StatusSetting?.getSetting?.();
        if (current?.text || current?.emojiName) {
            presets.items = [...presetList(), { text: current.text ?? "", emojiName: current.emojiName || undefined, emojiId: current.emojiId && current.emojiId !== "0" ? current.emojiId : undefined, status }];
            showToast(t("Saved your current status"), findAssetId("CheckmarkLargeIcon"));
            return;
        }
        prompt({
            title: t("New Status"),
            placeholder: t("What's on your mind?"),
            onSubmit: text => void (presets.items = [...presetList(), { text }]),
        });
    };
    return <Stack spacing={8}>
        <LogList
            title={t("Status Presets")}
            empty={t("Save your current status to set it again later in one tap")}
            entries={presetList().map((p, i) => ({
                key: String(i),
                label: `${p.emojiName && !p.emojiId ? `${p.emojiName} ` : ""}${p.text}`,
                subLabel: p.status ? t(p.status === "dnd" ? "Do Not Disturb" : p.status === "idle" ? "Idle" : p.status === "invisible" ? "Invisible" : "Online") : undefined,
                onPress: () => choose(p.text, [
                    { label: t("Set Status"), value: "set", icon: "CheckmarkLargeIcon" },
                    { label: t("Delete"), value: "delete", icon: "TrashIcon", danger: true },
                ], action => {
                    if (action === "delete") presets.items = presetList().filter((_, j) => j !== i);
                    else {
                        try {
                            applyPreset(p);
                            showToast(t("Status set"), findAssetId("CheckmarkLargeIcon"));
                        } catch (e) {
                            toastError(e);
                        }
                    }
                }),
            }))}
        />
        <Button text={t("Save Current Status")} variant="secondary" icon={findAssetId("PlusSmallIcon")} onPress={save} />
    </Stack>;
}

export default definePlugin({
    id: "endcord.status-presets",
    name: "StatusPresets",
    description: tx("Allows you to remember your statuses and set them later"),
    icon: "ReactionIcon",
    tags: ["Customisation", "Utility"],
    SettingsComponent: StatusPresetsPage,
    start() { },
});
