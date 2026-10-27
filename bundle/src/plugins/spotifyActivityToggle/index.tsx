/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addChatButton, getChatInputActionButton } from "../common";
import { api, command, generatedIcon, toastError } from "../hooks";
import { BUTTON_OPTIONS } from "../shared/activity";

async function toggleSpotifyActivity() {
    const accounts: any[] = await api("get", "/users/@me/connections");
    const spotify = accounts?.find?.(a => a?.type === "spotify");
    if (!spotify) {
        showToast(t("You haven't connected Spotify to Discord"), findAssetId("CircleXIcon-primary"));
        return;
    }
    const show = !spotify.show_activity;
    await api("patch", `/users/@me/connections/spotify/${spotify.id}`, { show_activity: show });
    showToast(show ? t("Your Spotify is shown again") : t("Your Spotify is hidden"), findAssetId(show ? "EyeIcon" : "EyeSlashIcon"));
}

export default definePlugin({
    id: "endcord.spotify-activity-toggle",
    name: "SpotifyActivityToggle",
    description: tx("Adds a toggle button for Spotify activity visibility."),
    authors: [ENDCORD_AUTHOR],
    icon: "MusicIcon",
    tags: ["Privacy", "Media"],
    settings: {
        button: { type: "select", label: tx("Chat bar button"), default: "none", options: BUTTON_OPTIONS },
    },
    start({ store, cleanup }) {
        const toggle = () => toggleSpotifyActivity().catch(toastError);
        cleanup(
            command({ name: "spotifyactivity", description: tx("Show or hide your Spotify on your profile"), run: toggle }),
            addChatButton({
                key: "spotify-activity-toggle",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const Button = getChatInputActionButton();
                    const Icon = generatedIcon("MusicIcon");
                    return Button && Icon ? <Button accessibilityLabel={t("Spotify activity")} IconComponent={Icon} onPress={toggle} /> : null;
                },
            }),
        );
    },
});
