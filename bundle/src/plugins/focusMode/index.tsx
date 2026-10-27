/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore } from "../common";
import { command, generatedIcon } from "../hooks";
import { choose } from "../ui/dialogs";

const statusSetting = () => findByProps("StatusSetting", "CustomStatusSetting")?.StatusSetting ?? findByProps("StatusSetting")?.StatusSetting;

export default definePlugin({
    id: "endcord.focus-mode",
    name: "FocusMode",
    description: tx("One switch for Do Not Disturb, for a while or until you turn it off, and back to your previous status when it ends"),
    icon: "BellZIcon",
    tags: ["Notifications", "Utility"],
    settings: {
        status: {
            type: "select",
            label: tx("Status while Focus Mode is on"),
            default: "dnd",
            options: [{ label: tx("Do Not Disturb"), value: "dnd" }, { label: tx("Idle"), value: "idle" }, { label: tx("Invisible"), value: "invisible" }],
        },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        let previous: string | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const on = () => previous !== undefined;
        const end = () => {
            clearTimeout(timer);
            if (previous === undefined) return;
            statusSetting()?.updateSetting?.(previous);
            previous = undefined;
            showToast(t("Focus Mode is off"), findAssetId("BellZIcon"));
        };
        const begin = (minutes?: number) => {
            if (!on()) previous = getStore("PresenceStore")?.getStatus?.(currentUserId()) ?? "online";
            statusSetting()?.updateSetting?.(store.status);
            clearTimeout(timer);
            if (minutes) timer = setTimeout(end, minutes * 60_000);
            showToast(minutes ? t("Focus Mode is on for {minutes} minutes", { minutes }) : t("Focus Mode is on"), findAssetId("BellZIcon"));
        };
        const toggle = () => on() ? end() : choose(t("Focus Mode"), [
            { label: t("For 30 minutes"), value: 30 }, { label: t("For 1 hour"), value: 60 },
            { label: t("For 2 hours"), value: 120 }, { label: t("Until I turn it off"), value: 0 },
        ], minutes => begin(minutes || undefined));
        cleanup(
            end,
            command({
                name: "focus",
                description: tx("Turn Focus Mode on or off"),
                options: [{ name: "minutes", description: tx("How long; leave it out to keep it on until you turn it off"), type: "integer" }],
                run: ({ minutes }) => {
                    if (on() && minutes == null) end();
                    else begin(minutes ? Number(minutes) : undefined);
                },
            }),
            addChatButton({
                key: "focus-mode",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const Button = getChatInputActionButton();
                    const Icon = generatedIcon("BellZIcon");
                    return Button && Icon ? <Button accessibilityLabel={t("Focus Mode")} IconComponent={Icon} onPress={toggle} /> : null;
                },
            }),
        );
    },
});
