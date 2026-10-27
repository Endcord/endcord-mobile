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
import { addChatButton, getChatInputActionButton } from "../common";
import { command, generatedIcon, toastError } from "../hooks";
import { BUTTON_OPTIONS } from "../shared/activity";

const showGameSetting = () => findByProps("ShowCurrentGame")?.ShowCurrentGame;

function toggleGameActivity() {
    const setting = showGameSetting();
    if (!setting?.updateSetting) throw new Error("Discord's activity setting wasn't found");
    const show = !(setting.getSetting?.() ?? true);
    setting.updateSetting(show);
    showToast(show ? t("Your activity is shown again") : t("Your activity is hidden"), findAssetId(show ? "EyeIcon" : "EyeSlashIcon"));
}

export default definePlugin({
    id: "endcord.game-activity-toggle",
    name: "GameActivityToggle",
    description: tx("Adds a button beside the message box and /gameactivity to show or hide what you're playing"),
    icon: "GameControllerIcon",
    tags: ["Privacy", "Utility"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "right", options: BUTTON_OPTIONS },
    },
    start({ store, cleanup }) {
        cleanup(
            command({ name: "gameactivity", description: tx("Show or hide what you're playing on your profile"), run: () => toggleGameActivity() }),
            addChatButton({
                key: "game-activity-toggle",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const Button = getChatInputActionButton();
                    const Icon = generatedIcon("GameControllerIcon");
                    return Button && Icon ? <Button accessibilityLabel={t("Game activity")} IconComponent={Icon} onPress={() => {
                        try {
                            toggleGameActivity();
                        } catch (e) {
                            toastError(e);
                        }
                    }} /> : null;
                },
            }),
        );
    },
});
