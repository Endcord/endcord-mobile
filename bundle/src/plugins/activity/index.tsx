/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's status, activity and sound plugins: statuses that follow what you're doing, what your profile shows,
 * voice volumes, and Discord's own sounds.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { FluxDispatcher } from "@metro/common";
import { AppState, NativeModules } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore, subscribe } from "../common";
import { api, botMessage, command, generatedIcon, playSound } from "../hooks";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const myVoiceChannel = (): string | undefined => getStore("SelectedChannelStore")?.getVoiceChannelId?.() ?? undefined;
const voiceActions = () => findByProps("selectVoiceChannel", "disconnect") ?? findByProps("selectVoiceChannel");

const STATUS_OPTIONS = [
    { label: tx("Do Not Disturb"), value: "dnd" },
    { label: tx("Idle"), value: "idle" },
    { label: tx("Invisible"), value: "invisible" },
    { label: tx("Online"), value: "online" },
];

const BUTTON_OPTIONS = [
    { label: tx("Hidden"), value: "none" },
    { label: tx("Left of the message box"), value: "left" },
    { label: tx("Right of the message box"), value: "right" },
];

// Statuses -------------------------------------------------------------------------------------------------------------

const statusSetting = () => findByProps("StatusSetting", "CustomStatusSetting")?.StatusSetting ?? findByProps("StatusSetting")?.StatusSetting;
const currentStatus = (): string => statusSetting()?.getSetting?.() ?? getStore("PresenceStore")?.getStatus?.(currentUserId()) ?? "online";

/**
 * Sets a status for a while and puts the previous one back afterwards, unless you changed it yourself in between
 */
function statusHold() {
    let previous: string | undefined, applied: string | undefined;
    return {
        get active() {
            return applied !== undefined;
        },
        set(status: string) {
            // Already set; if you changed it yourself since, that's kept
            if (applied === status) return;
            const setting = statusSetting();
            if (!setting?.updateSetting) throw new Error("Discord's status settings weren't found");
            if (applied === undefined) previous = currentStatus();
            if (currentStatus() !== status) setting.updateSetting(status);
            applied = status;
        },
        release() {
            if (applied === undefined) return;
            if (previous && currentStatus() === applied && previous !== applied) statusSetting()?.updateSetting?.(previous);
            applied = previous = undefined;
        },
    };
}

/**
 * Whether you're playing a game on another device (a computer or console). Phones don't report games, and the
 * activities this phone shows are ones you set yourself, such as CustomRPC, so they don't count.
 */
function playingAnything(): boolean {
    const sessions = Object.values<any>(getStore("SessionsStore")?.getSessions?.() ?? {});
    const activities: any[] = [
        ...sessions.filter(s => s?.clientInfo?.client !== "mobile").flatMap(s => s?.activities ?? []),
        ...getStore("RunningGameStore")?.getRunningGames?.() ?? [],
    ];
    return activities.some(a => a && (a.type === 0 || a.type === undefined && a.name));
}

const AutoDNDWhilePlaying = definePlugin({
    id: "endcord.auto-dnd-while-playing",
    name: "AutoDNDWhilePlaying",
    description: tx("Automatically updates your online status (online, idle, dnd) when launching games"),
    authors: [ENDCORD_AUTHOR],
    icon: "GameControllerIcon",
    tags: ["Notifications", "Utility"],
    settings: {
        status: { type: "select", label: tx("Status while playing"), description: tx("Your status goes back to what it was when you stop playing"), default: "dnd", options: STATUS_OPTIONS },
    },
    start({ store, cleanup }) {
        const hold = statusHold();
        const check = () => {
            if (playingAnything()) hold.set(store.status);
            else hold.release();
        };
        cleanup(
            () => hold.release(),
            subscribe("SESSIONS_REPLACE", check),
            subscribe("RUNNING_GAMES_CHANGE", check),
            subscribe("LOCAL_ACTIVITY_UPDATE", check),
        );
        check();
    },
});

const StatusWhileActive = definePlugin({
    id: "endcord.status-while-active",
    name: "StatusWhileActive",
    description: tx("Automatically updates your online status when in a voice channel."),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Notifications"],
    settings: {
        status: { type: "select", label: tx("Status while in a voice channel"), description: tx("Your status goes back to what it was when you leave"), default: "dnd", options: STATUS_OPTIONS },
    },
    start({ store, cleanup }) {
        const hold = statusHold();
        const check = () => {
            if (myVoiceChannel()) hold.set(store.status);
            else hold.release();
        };
        cleanup(() => hold.release(), subscribe("VOICE_CHANNEL_SELECT", () => setTimeout(check, 0)));
        check();
    },
});

// GameActivityToggle ---------------------------------------------------------------------------------------------------

const showGameSetting = () => findByProps("ShowCurrentGame")?.ShowCurrentGame;

function toggleGameActivity() {
    const setting = showGameSetting();
    if (!setting?.updateSetting) throw new Error("Discord's activity setting wasn't found");
    const show = !(setting.getSetting?.() ?? true);
    setting.updateSetting(show);
    showToast(show ? t("Your activity is shown again") : t("Your activity is hidden"), findAssetId(show ? "EyeIcon" : "EyeSlashIcon"));
}

const GameActivityToggle = definePlugin({
    id: "endcord.game-activity-toggle",
    name: "GameActivityToggle",
    description: tx("Adds a button beside the message box and /gameactivity to show or hide what you're playing"),
    authors: [ENDCORD_AUTHOR],
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
                            showToast(e instanceof Error ? e.message : String(e), findAssetId("CircleXIcon-primary"));
                        }
                    }} /> : null;
                },
            }),
        );
    },
});

// SpotifyActivityToggle ------------------------------------------------------------------------------------------------

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

const SpotifyActivityToggle = definePlugin({
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
        const toggle = () => toggleSpotifyActivity().catch(e => showToast(e?.body?.message ?? String(e?.message ?? e), findAssetId("CircleXIcon-primary")));
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

// UniversalVolume ------------------------------------------------------------------------------------------------------

function setUserVolume(userId: string, volume: number) {
    const actions = findByProps("setLocalVolume");
    if (actions?.setLocalVolume) actions.setLocalVolume(userId, volume, "default");
    else FluxDispatcher.dispatch({ type: "AUDIO_SET_LOCAL_VOLUME", userId, volume, context: "default" });
}

const UniversalVolume = definePlugin({
    id: "endcord.universal-volume",
    name: "UniversalVolume",
    description: tx("Sets everyone in your voice channel to the same volume, and keeps new people who join at that level too."),
    authors: [ENDCORD_AUTHOR],
    icon: "VoiceNormalIcon",
    tags: ["Voice"],
    settings: {
        volume: { type: "number", label: tx("Volume (%)"), default: 100, min: 0, max: 200 },
    },
    start({ store, cleanup }) {
        const done = new Set<string>();
        const apply = () => {
            const channelId = myVoiceChannel();
            if (!channelId) return done.clear();
            const me = currentUserId();
            const states = getStore("VoiceStateStore")?.getVoiceStatesForChannel?.(channelId) ?? {};
            for (const userId of Object.keys(states)) {
                if (userId === me || done.has(userId)) continue;
                done.add(userId);
                setUserVolume(userId, store.volume);
            }
        };
        cleanup(
            subscribe("VOICE_STATE_UPDATES", apply),
            subscribe("VOICE_CHANNEL_SELECT", () => {
                done.clear();
                setTimeout(apply, 500);
            }),
            command({
                name: "universalvolume",
                description: tx("Set everyone in your voice channel to one volume"),
                options: [{ name: "volume", description: tx("From 0 to 200; 100 is normal"), type: "integer", required: true }],
                run: ({ volume }, ctx) => {
                    store.volume = Math.min(200, Math.max(0, Number(volume)));
                    done.clear();
                    apply();
                    botMessage(ctx.channel.id, t("Everyone in your voice channel is at {volume}%.", { volume: store.volume }));
                },
            }),
        );
        apply();
    },
});

// ExitSounds -----------------------------------------------------------------------------------------------------------

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
    add(store?.getDefaultSounds?.());
    const byGuild = store?.getSounds?.();
    if (byGuild instanceof Map) byGuild.forEach(add);
    else if (byGuild) Object.values(byGuild).forEach(add);
    return all;
}

const ExitSounds = definePlugin({
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
            run: (_, ctx) => {
                const sounds = soundboardSounds();
                if (!sounds.length) {
                    botMessage(ctx.channel.id, t("No soundboard sounds are loaded yet; open the soundboard once in a voice channel, then try again."));
                    return;
                }
                choose(t("Exit sound"), sounds.map(s => ({ label: `${s.emojiName ? `${s.emojiName} ` : ""}${s.name}`, value: s })), s => {
                    store.soundId = s.soundId;
                    store.guildId = s.guildId && s.guildId !== "DEFAULT" ? String(s.guildId) : "";
                    showToast(t("{sound} plays when you leave voice", { sound: s.name }), findAssetId("SoundboardIcon"));
                });
            },
        }));
    },
});

// CustomSounds / NotificationVolume ------------------------------------------------------------------------------------

/** Discord's native sound player; changing it fails on devices where it is a read-only native object */
function soundManager() {
    const manager = NativeModules.DCDSoundManager;
    if (typeof manager?.prepare !== "function") throw new Error("Discord's sound player wasn't found");
    return manager;
}

function patchSoundManager(key: string, patch: (manager: any) => () => unknown) {
    const manager = soundManager();
    const original = manager[key];
    const unpatch = patch(manager);
    if (manager[key] === original) {
        unpatch();
        throw new Error("Discord's sound player can't be changed on this device");
    }
    return unpatch;
}

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

const CustomSounds = definePlugin({
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

const NotificationVolume = definePlugin({
    id: "endcord.notification-volume",
    name: "NotificationVolume",
    description: tx("Save your ears and set a separate volume for notifications and in-app sounds"),
    authors: [ENDCORD_AUTHOR],
    icon: "BellIcon",
    tags: ["Notifications"],
    settings: {
        volume: { type: "number", label: tx("Volume (%)"), default: 50, min: 0, max: 100 },
    },
    start({ store, cleanup }) {
        const factor = () => Math.min(Math.max(store.volume / 100, 0), 1);
        let setVolume: ((id: number, volume: number) => unknown) | undefined;
        cleanup(patchSoundManager("setVolume", manager => {
            const original = manager.setVolume?.bind(manager);
            setVolume = original;
            return instead("setVolume", manager, ([id, volume], orig) => orig(id, Number(volume) * factor()));
        }));
        cleanup(patchSoundManager("prepare", manager => instead("prepare", manager, (args, orig) => {
            const done = args[3];
            // Discord doesn't always set a volume, so every sound starts at the chosen one
            return orig(args[0], args[1], args[2], (error: unknown, sound: unknown) => {
                if (!error) setVolume?.(args[2], factor());
                if (typeof done === "function") done(error, sound);
            });
        })));
    },
});

// IdleAutoRestart ------------------------------------------------------------------------------------------------------

const IdleAutoRestart = definePlugin({
    id: "endcord.idle-auto-restart",
    name: "IdleAutoRestart",
    description: tx("Reloads Discord when you come back after leaving it in the background for a while, so it starts fresh, but never during a call"),
    authors: [ENDCORD_AUTHOR],
    icon: "RetryIcon",
    tags: ["Utility"],
    settings: {
        minutes: { type: "number", label: tx("After (minutes)"), default: 60, min: 5, max: 1440 },
    },
    start({ store, cleanup }) {
        let leftAt: number | undefined;
        const subscription = AppState.addEventListener("change", state => {
            if (state === "background") leftAt = Date.now();
            else if (state === "active" && leftAt) {
                const away = Date.now() - leftAt;
                leftAt = undefined;
                if (away >= store.minutes * 60_000 && !myVoiceChannel()) BundleUpdaterManager.reload();
            }
        });
        cleanup(() => subscription.remove());
    },
});

export default [AutoDNDWhilePlaying, StatusWhileActive, GameActivityToggle, SpotifyActivityToggle, UniversalVolume, ExitSounds, CustomSounds, NotificationVolume, IdleAutoRestart];
