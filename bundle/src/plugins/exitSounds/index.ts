/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore } from "../common";
import { api, botMessage, command } from "../hooks";
import { myVoiceChannel } from "../shared/activity";
import { choose } from "../ui/dialogs";

const voiceActions = () => findByProps("selectVoiceChannel", "disconnect") ?? findByProps("selectVoiceChannel");

interface Sound {
    soundId: string;
    name: string;
    guildId?: string;
    emojiName?: string;
}

function soundboardSounds(): Sound[] {
    const store = getStore("SoundboardStore");
    const all: Sound[] = [];
    const add = (sounds: any) => {
        for (const s of sounds ?? []) if (s?.soundId) all.push({ soundId: String(s.soundId), name: s.name, guildId: s.guildId, emojiName: s.emojiName });
    };
    // Older Discord kept its own sounds apart; 350 has them in getSounds under the server ID "0"
    add(store?.getDefaultSounds?.());
    const byGuild = store?.getSounds?.();
    if (byGuild instanceof Map) byGuild.forEach(add);
    else if (byGuild) Object.values(byGuild).forEach(add);
    return all;
}

/** The soundboard's sounds, asking Discord for them first when it hasn't loaded them (it does when the soundboard opens) */
async function loadSoundboardSounds(): Promise<Sound[]> {
    if (soundboardSounds().length) return soundboardSounds();
    findByProps("maybeFetchSoundboardSounds")?.maybeFetchSoundboardSounds?.();
    const store = getStore("SoundboardStore");
    await new Promise<void>(resolve => {
        const check = () => {
            if (!soundboardSounds().length) return;
            done();
        };
        const done = () => {
            clearTimeout(timer);
            store?.removeChangeListener?.(check);
            resolve();
        };
        const timer = setTimeout(done, 8000);
        store?.addChangeListener?.(check);
    });
    return soundboardSounds();
}

export default definePlugin({
    id: "endcord.exit-sounds",
    name: "ExitSounds",
    description: tx("Play soundboard sounds when you disconnect from voice."),
    authors: [ENDCORD_AUTHOR],
    icon: "SoundboardIcon",
    tags: ["Voice", "Fun"],
    settings: {
        soundId: { type: "string", label: tx("Sound ID"), description: tx("Pick one with /exitsound"), default: "" },
        guildId: { type: "string", label: tx("Server of the sound"), description: tx("Filled in by /exitsound; empty for Discord's own sounds"), default: "" },
        delay: { type: "number", label: tx("Wait before leaving (ms)"), description: tx("Long enough for the others to hear it"), default: 1500, min: 200, max: 5000 },
    },
    start({ store, cleanup }) {
        const actions = voiceActions();
        if (!actions?.selectVoiceChannel) throw new Error("Discord's voice actions weren't found");
        let leaving = false;
        const leaveWithSound = (leave: () => unknown) => {
            const channelId = myVoiceChannel();
            if (!channelId || !store.soundId || leaving) return leave();
            leaving = true;
            api("post", `/channels/${channelId}/send-soundboard-sound`, { sound_id: store.soundId, ...store.guildId && store.guildId !== "0" ? { source_guild_id: store.guildId } : {} })
                .catch(() => { })
                .then(() => new Promise(r => setTimeout(r, store.delay)))
                // Discord's disconnect can call selectVoiceChannel(null) itself; that call goes straight through
                .then(() => leave())
                .finally(() => setTimeout(() => leaving = false, 1000));
        };
        cleanup(instead("selectVoiceChannel", actions, (args, orig) => args[0] == null ? leaveWithSound(() => orig(...args)) : orig(...args)));
        if (typeof actions.disconnect === "function") cleanup(instead("disconnect", actions, (args, orig) => leaveWithSound(() => orig(...args))));
        cleanup(command({
            name: "exitsound",
            description: tx("Choose the sound played when you leave voice"),
            run: async (_, ctx) => {
                const sounds = await loadSoundboardSounds();
                if (!sounds.length) {
                    botMessage(ctx.channel.id, t("No soundboard sounds are loaded yet; open the soundboard once in a voice channel, then try again."));
                    return;
                }
                choose(t("Exit sound"), sounds.map(s => ({ label: `${s.emojiName ? `${s.emojiName} ` : ""}${s.name}`, value: s })), s => {
                    store.soundId = s.soundId;
                    store.guildId = s.guildId && s.guildId !== "DEFAULT" && s.guildId !== "0" ? String(s.guildId) : "";
                    showToast(t("{sound} plays when you leave voice", { sound: s.name }), findAssetId("SoundboardIcon"));
                });
            },
        }));
    },
});
