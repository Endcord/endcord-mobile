/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addChatButton } from "../common";
import { onSend } from "../hooks";
import { chatButtonSetting, ToggleButton } from "../shared/compose";

const SUPPRESS_NOTIFICATIONS = 1 << 12;

const SilentMessageToggle = definePlugin({
    id: "endcord.silent-message-toggle",
    name: "SilentMessageToggle",
    description: tx("Adds a button to the chat bar to toggle sending a silent message."),
    icon: "BellSlashIcon",
    tags: ["Chat", "Notifications"],
    settings: {
        enabled: { type: "boolean", label: tx("Send silently"), description: tx("Your messages don't send push notifications"), default: false },
        autoDisable: { type: "boolean", label: tx("Turn off after one message"), description: tx("Automatically disable the silent message toggle again after sending one"), default: true },
        button: { ...chatButtonSetting, default: "left" },
    },
    start({ store, cleanup }) {
        cleanup(
            onSend("silent-message", (_, { editing, options }) => {
                if (editing || !store.enabled || !options) return;
                options.flags = (options.flags ?? 0) | SUPPRESS_NOTIFICATIONS;
                if (store.autoDisable) store.enabled = false;
            }, 95),
            addChatButton({
                key: "silent-message",
                side: () => store.button as "left" | "right" | "none",
                render: () => <ToggleButton store={SilentMessageToggle.store} field="enabled" icon="BellIcon" slashWhenOn label={t("Send silently")} on={t("Silent messages are on")} off={t("Silent messages are off")} />,
            }),
        );
    },
});

export default SilentMessageToggle;
