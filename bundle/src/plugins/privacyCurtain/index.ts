/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's PrivacyCurtain, for a phone: on a computer it covers Discord when you step away; on a phone what others
 * see is the preview in the recent apps screen, and screenshots. On Android the loader sets it on Discord's window
 * (ScreenPrivacy.kt), before Discord draws anything, so a preview of a chat is never taken. On iOS the tweak covers
 * Discord whenever it stops being the active app (ScreenPrivacy.m); iOS lets no app block screenshots or recordings.
 */

import { t, tx } from "@core/i18n";
import { callLoaderMethod, callLoaderMethodAsync } from "@lib/api/native/modules";
import { Platform } from "react-native";

import { definePlugin, onSettingChange } from "../api";

type Mode = "off" | "recents" | "all";

/** Through the loader's synchronous bridge, or its asynchronous one when the first isn't there */
async function setMode(mode: Mode) {
    try {
        return callLoaderMethod<string>("endcord.screenPrivacy.set", mode);
    } catch {
        return callLoaderMethodAsync<string>("endcord.screenPrivacy.set", mode);
    }
}

const plugin = definePlugin({
    id: "endcord.privacy-curtain",
    name: "PrivacyCurtain",
    description: tx("Keeps your chats out of the recent apps screen, and if you like out of screenshots and screen recordings too."),
    icon: "EyeSlashIcon",
    tags: ["Privacy"],
    settings: {
        mode: {
            type: "select",
            label: tx("Hide Discord from"),
            description: tx("On Android 12 and older, hiding it from the recent apps screen blocks screenshots too. iPhones can't block screenshots or screen recordings, so there only the app switcher's preview is hidden."),
            default: "recents",
            options: [
                { label: tx("The recent apps screen"), value: "recents" },
                { label: tx("The recent apps screen, screenshots and screen recordings"), value: "all" },
            ],
        },
    },
    async start({ store, cleanup, logger }) {
        const wanted = (): Mode => store.mode === "all" ? "all" : "recents";
        try {
            await setMode(wanted());
        } catch (e) {
            logger.warn("The loader can't hide the screen", e);
            throw new Error(Platform.OS === "ios"
                ? t("This needs a newer Endcord: install the latest Endcord.ipa.")
                : t("This needs a newer Endcord. Install it again with Endcord Installer."));
        }
        cleanup(
            onSettingChange(store, key => {
                if (key === "mode") setMode(wanted()).catch(e => logger.error("Couldn't change what's hidden", e));
            }),
            // Turned off, Discord shows in the recent apps screen and screenshots again
            () => void setMode("off").catch(e => logger.error("Couldn't show the screen again", e)),
        );
    },
});

export default plugin;
