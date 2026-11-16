/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's Animalese: short messages arriving in the chat you have open are read out in Animal Crossing's
 * animalese. PC loads all 30 letter sounds when it starts; here a letter's sound is downloaded the first time a message
 * needs it, from the same place, and kept on the phone, so nothing is downloaded while the plugin is off and each sound
 * only once. The sound is made as PC makes it and played by Discord's own player. Unlike PC, nothing plays while
 * Discord is in the background, and a busy chat doesn't stack up sounds: one plays at a time, the newest message next.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { NativeFileModule } from "@lib/api/native/modules";
import { showToast } from "@lib/ui/toasts";
import safeFetch, { readBytes } from "@lib/utils/safeFetch";
import { AppState, NativeModules } from "react-native";

import { definePlugin } from "../api";
import { currentUserId, subscribe } from "../common";
import { fromBase64, toBase64 } from "../crypto";
import { currentChannelId } from "../hooks";
import { encodeWav, letterSounds, mix, parseWav, type Sound } from "./audio";

const BASE_URL = "https://raw.githubusercontent.com/Equicord/Equibored/main/sounds/animalese";
/** Each letter's sound is about 24 KB */
const MAX_SOUND_BYTES = 512 * 1024;
const DOWNLOAD_TIMEOUT = 15_000;
/** A message whose sounds took longer than this to arrive isn't read out any more */
const STALE_AFTER = 10_000;
const URL_PATTERN = /https?:\/\/\S/;
/** Where the letters are kept and the sounds are written, in Discord's cache folder */
const FOLDER = "endcord/animalese";

const QUALITIES = new Set(["high", "med", "low"]);
/** The longest message read out: the setting's own largest */
const MAX_LENGTH = 200;

const soundName = (index: number) => `sound${String(index).padStart(2, "0")}`;

function cachePath(relative: string) {
    const dir = NativeFileModule?.getConstants?.()?.CacheDirPath;
    return typeof dir === "string" ? `${dir}/${relative}` : undefined;
}

/** The letters' sounds for one run of the plugin: from memory, from the phone, or else downloaded once and kept */
function letterCache(signal: AbortSignal) {
    const memory = new Map<string, Sound>();
    const downloads = new Map<string, Promise<Sound | undefined>>();

    async function download(url: string): Promise<Uint8Array> {
        // Given up on after a while, and when the plugin stops
        const local = new AbortController();
        const stop = () => local.abort();
        signal.addEventListener?.("abort", stop);
        const timer = setTimeout(stop, DOWNLOAD_TIMEOUT);
        try {
            const res = await safeFetch(url, { signal: local.signal }, DOWNLOAD_TIMEOUT);
            return new Uint8Array(await readBytes(res, MAX_SOUND_BYTES));
        } finally {
            clearTimeout(timer);
            signal.removeEventListener?.("abort", stop);
        }
    }

    async function load(key: string): Promise<Sound | undefined> {
        const relative = `${FOLDER}/${key}.wav`;
        const full = cachePath(relative);
        let sound: Sound | undefined;
        try {
            if (full && await NativeFileModule.fileExists(full)) sound = parseWav(fromBase64(await NativeFileModule.readFile(full, "base64")));
        } catch {
            // Not kept, or not readable: downloaded again
        }
        if (!sound) {
            if (signal.aborted) return undefined;
            const bytes = await download(`${BASE_URL}/${key}.wav`);
            sound = parseWav(bytes);
            await NativeFileModule.writeFile("cache", relative, toBase64(bytes), "base64").catch(() => { });
        }
        if (signal.aborted) return undefined;
        memory.set(key, sound);
        return sound;
    }

    return {
        get(quality: string, index: number): Promise<Sound | undefined> {
            const key = `${quality}/${soundName(index)}`;
            const known = memory.get(key);
            if (known) return Promise.resolve(known);
            let pending = downloads.get(key);
            if (!pending) {
                pending = load(key).catch(() => undefined).finally(() => downloads.delete(key));
                downloads.set(key, pending);
            }
            return pending;
        },
        clear() {
            memory.clear();
            downloads.clear();
        },
    };
}

let nextSoundId = 760_000;

/** Plays a file with Discord's player; rejects when the player can't */
function playFile(uri: string, volume: number) {
    const player = NativeModules.DCDSoundManager;
    if (typeof player?.prepare !== "function") return Promise.reject(new Error("Discord's sound player wasn't found"));
    return new Promise<void>((resolve, reject) => {
        const id = nextSoundId++;
        const giveUp = setTimeout(() => reject(new Error("Discord's sound player didn't answer")), 10_000);
        player.prepare(uri, "music", id, (error: unknown, sound?: { duration?: number; }) => {
            clearTimeout(giveUp);
            if (error) {
                player.release?.(id);
                reject(error instanceof Error ? error : new Error(String((error as any)?.message ?? error)));
                return;
            }
            player.setVolume?.(id, Math.min(Math.max(volume, 0), 1));
            player.play(id);
            const duration = typeof sound?.duration === "number" && sound.duration > 0 ? sound.duration : 5;
            setTimeout(() => {
                player.release?.(id);
                resolve();
            }, Math.min(duration, 30) * 1000 + 300);
        });
    });
}

export default definePlugin({
    id: "endcord.animalese",
    name: "Animalese",
    description: tx("Plays animal crossing animalese for every message sent (they yap a lot)"),
    icon: "SoundboardIcon",
    tags: ["Customisation", "Fun"],
    settings: {
        volume: { type: "number", label: tx("Volume"), description: tx("Volume of the animalese sound, from 0 to 100"), default: 50, min: 0, max: 100 },
        speed: {
            type: "select",
            label: tx("Speed"),
            description: tx("Speed of the animalese sound"),
            default: "1",
            options: ["0.5", "0.75", "1", "1.25", "1.5"].map(v => ({ label: `${v}×`, value: v })),
        },
        pitch: {
            type: "select",
            label: tx("Pitch"),
            description: tx("Pitch multiplier"),
            default: "1",
            options: ["0.75", "0.8", "0.85", "1", "1.15", "1.25", "1.35", "1.5"].map(v => ({ label: `${v}×`, value: v })),
        },
        messageLengthLimit: { type: "number", label: tx("Longest message"), description: tx("Maximum length of message to process"), default: 50, min: 1, max: 200 },
        processOwnMessages: { type: "boolean", label: tx("Your own messages"), description: tx("Enable to yap your own messages too"), default: true },
        soundQuality: {
            type: "select",
            label: tx("Sound quality"),
            description: tx("Quality of sound to use"),
            default: "high",
            options: [
                { label: tx("High"), value: "high" },
                { label: tx("Medium"), value: "med" },
                { label: tx("Low"), value: "low" },
            ],
        },
    },
    start({ store, cleanup, logger }) {
        if (typeof NativeModules.DCDSoundManager?.prepare !== "function") throw new Error("Discord's sound player wasn't found");
        if (typeof NativeFileModule?.writeFile !== "function" || !cachePath("")) throw new Error("Discord's files weren't found");
        const running = new AbortController();
        const letters = letterCache(running.signal);

        let busy = false;
        let next: { text: string; at: number; } | undefined;
        let files = 0;
        // Which way of naming a file Discord's player takes: found with the first sound, and kept
        let uriStyle: "file" | "path" | undefined;
        let warned = false;

        async function speak(text: string, at: number) {
            const quality = QUALITIES.has(store.soundQuality) ? store.soundQuality : "high";
            const sounds = letterSounds(text);
            if (!sounds.length) return;
            const loaded = new Map<number, Sound | undefined>();
            for (const index of new Set(sounds)) loaded.set(index, await letters.get(quality, index));
            if (running.signal.aborted || Date.now() - at > STALE_AFTER) return;
            if (![...loaded.values()].some(Boolean)) throw new Error(t("The letters' sounds didn't download"));
            const samples = mix(sounds.map(index => loaded.get(index)), {
                speed: Number(store.speed) || 1,
                pitch: Number(store.pitch) || 1,
                question: text.trim().endsWith("?"),
            });
            // A few files in turn, so one being written is never the one playing
            const relative = `${FOLDER}/play-${files++ % 3}.wav`;
            const written: unknown = await NativeFileModule.writeFile("cache", relative, toBase64(encodeWav(samples)), "base64");
            const path = typeof written === "string" && written.startsWith("/") ? written : cachePath(relative)!;
            if (running.signal.aborted) return;
            const volume = store.volume / 100;
            if (uriStyle !== "path") {
                try {
                    await playFile(`file://${path}`, volume);
                    uriStyle = "file";
                    return;
                } catch (e) {
                    if (uriStyle === "file") throw e;
                }
            }
            await playFile(path, volume);
            uriStyle = "path";
        }

        async function drain() {
            if (busy) return;
            busy = true;
            try {
                while (next && !running.signal.aborted) {
                    const { text, at } = next;
                    next = undefined;
                    try {
                        await speak(text, at);
                    } catch (e) {
                        logger.warn("Couldn't play animalese", e);
                        if (!warned && !running.signal.aborted) {
                            warned = true;
                            showToast(t("Animalese couldn't play its sound: {error}", { error: String((e as Error)?.message ?? e).slice(0, 80) }), findAssetId("CircleXIcon-primary"));
                        }
                    }
                }
            } finally {
                busy = false;
            }
        }

        cleanup(
            subscribe("MESSAGE_CREATE", ({ optimistic, message, channelId }) => {
                if (optimistic || !message || message.state === "SENDING") return;
                const { content } = message;
                if (typeof content !== "string" || !content || message.author?.bot) return;
                if ((channelId ?? message.channel_id) !== currentChannelId() || AppState.currentState !== "active") return;
                // At most the setting's own largest, whatever a restored backup says: a slow sound of a long message is big
                if (content.length > Math.min(MAX_LENGTH, store.messageLengthLimit) || URL_PATTERN.test(content)) return;
                if (!store.processOwnMessages && message.author?.id === currentUserId()) return;
                // The newest one waits for the one playing; any between them are skipped
                next = { text: content, at: Date.now() };
                void drain();
            }),
            () => {
                running.abort();
                letters.clear();
                next = undefined;
            },
        );
    },
});
