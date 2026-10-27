/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { instead } from "@lib/api/patcher";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { playSound } from "../hooks";
import { patchSoundManager } from "../shared/activity";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const sounds = wrapSync(createStorage<{ replaced: Record<string, string>; seen: string[]; }>(createMMKVBackend("ENDCORD_CUSTOM_SOUNDS", { replaced: {}, seen: [] })));

function SoundsPage() {
    useProxy(sounds);
    const replaced = sounds.replaced ?? {};
    const names = [...new Set([...Object.keys(replaced), ...sounds.seen ?? []])];
    return <LogList
        title={t("Sounds")}
        empty={t("Sounds show up here once Discord has played them, such as when a message arrives")}
        entries={names.map(name => ({
            key: name,
            label: name,
            subLabel: replaced[name] ?? t("Discord's own sound"),
            icon: replaced[name] ? "MusicIcon" : "SoundboardIcon",
            onPress: () => choose(name, [
                { label: t("Replace with a Link…"), value: "set" },
                ...replaced[name] ? [{ label: t("Play"), value: "play" }, { label: t("Use Discord's Own Sound"), value: "reset" }] : [],
            ], action => {
                if (action === "play") playSound(replaced[name]);
                else if (action === "reset") {
                    const next = { ...replaced };
                    delete next[name];
                    sounds.replaced = next;
                } else prompt({
                    title: name,
                    placeholder: "https://…/sound.mp3",
                    initial: replaced[name] ?? "",
                    onSubmit: url => {
                        if (!/^https?:\/\//.test(url.trim())) throw new Error(t("Enter a link that starts with https://"));
                        sounds.replaced = { ...replaced, [name]: url.trim() };
                    },
                });
            }),
        }))}
    />;
}

export default definePlugin({
    id: "endcord.custom-sounds",
    name: "CustomSounds",
    description: tx("Customize Discord's sounds."),
    authors: [ENDCORD_AUTHOR],
    icon: "MusicIcon",
    tags: ["Customisation", "Notifications"],
    SettingsComponent: SoundsPage,
    async start({ cleanup }) {
        await awaitStorage(sounds);
        cleanup(patchSoundManager("prepare", manager => instead("prepare", manager, (args, orig) => {
            const [name] = args;
            if (typeof name === "string" && !/^https?:\/\//.test(name)) {
                const seen = sounds.seen ?? [];
                if (!seen.includes(name)) sounds.seen = [...seen, name].slice(-40);
                const url = sounds.replaced?.[name];
                if (url) return orig(url, ...args.slice(1));
            }
            return orig(...args);
        })));
    },
});
