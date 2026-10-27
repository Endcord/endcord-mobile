/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, onSettingChange } from "../api";
import { ASSET_APP, externalAsset, setActivity } from "../shared/presence";

const ACTIVITY_TYPES = [
    { label: tx("Playing"), value: "0" },
    { label: tx("Listening to"), value: "2" },
    { label: tx("Watching"), value: "3" },
    { label: tx("Competing in"), value: "5" },
];

const CUSTOM_RPC = "endcord:custom-rpc";

export default definePlugin({
    id: "endcord.custom-rpc",
    name: "CustomRPC",
    description: tx("Add a fully customisable Rich Presence (Game status) to your Discord profile"),
    icon: "GameControllerIcon",
    tags: ["Customisation"],
    settings: {
        type: { type: "select", label: tx("Activity type"), default: "0", options: ACTIVITY_TYPES },
        name: { type: "string", label: tx("Name"), description: tx("The game or app name people see"), default: "Endcord" },
        details: { type: "string", label: tx("Details"), description: tx("The first line under the name"), default: "" },
        state: { type: "string", label: tx("State"), description: tx("The second line under the name"), default: "" },
        largeImage: { type: "string", label: tx("Large image"), description: tx("A link to an image"), placeholder: "https://…", default: "" },
        largeText: { type: "string", label: tx("Large image text"), default: "" },
        smallImage: { type: "string", label: tx("Small image"), description: tx("A link to an image"), placeholder: "https://…", default: "" },
        smallText: { type: "string", label: tx("Small image text"), default: "" },
        showElapsed: { type: "boolean", label: tx("Show elapsed time"), description: tx("Show how long the activity has been going"), default: true },
        button1Text: { type: "string", label: tx("First button text"), default: "" },
        button1Url: { type: "string", label: tx("First button link"), placeholder: "https://…", default: "" },
        button2Text: { type: "string", label: tx("Second button text"), default: "" },
        button2Url: { type: "string", label: tx("Second button link"), placeholder: "https://…", default: "" },
        appId: { type: "string", label: tx("Application ID"), description: tx("Optional; a Discord application whose name and art to use. Image links work without one."), default: "" },
    },
    start({ store, cleanup, logger }) {
        const started = Date.now();
        let generation = 0;
        const update = async () => {
            const current = ++generation;
            const appId = store.appId.trim() || "0";
            const image = async (url: string) => url.trim() ? externalAsset(appId !== "0" ? appId : ASSET_APP, url.trim()).catch(e => void logger.warn("Couldn't load an image", e)) : undefined;
            const [large, small] = await Promise.all([image(store.largeImage), image(store.smallImage)]);
            if (current !== generation) return;
            const buttons = [[store.button1Text, store.button1Url], [store.button2Text, store.button2Url]].filter(([text, url]) => text.trim() && /^https?:\/\//.test(url.trim()));
            setActivity(CUSTOM_RPC, {
                name: store.name.trim() || "Endcord",
                application_id: appId,
                type: Number(store.type),
                flags: 1,
                details: store.details.trim() || undefined,
                state: store.state.trim() || undefined,
                timestamps: store.showElapsed ? { start: started } : undefined,
                assets: {
                    large_image: large,
                    large_text: large ? store.largeText.trim() || undefined : undefined,
                    small_image: small,
                    small_text: small ? store.smallText.trim() || undefined : undefined,
                },
                buttons: buttons.length ? buttons.map(([text]) => text.trim()) : undefined,
                metadata: buttons.length ? { button_urls: buttons.map(([, url]) => url.trim()) } : undefined,
            });
        };
        // Typing in the settings changes many values in a row; the presence is sent once they settle
        let timer: ReturnType<typeof setTimeout> | undefined;
        cleanup(
            () => clearTimeout(timer),
            () => setActivity(CUSTOM_RPC, null),
            onSettingChange(store, () => {
                clearTimeout(timer);
                timer = setTimeout(update, 1500);
            }),
        );
        update();
    },
});
