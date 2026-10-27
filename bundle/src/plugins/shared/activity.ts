/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's status, activity and sound plugins: statuses that follow what you're doing, what your profile shows,
 * voice volumes, and Discord's own sounds.
 *
 * What more than one of these plugins uses.
 */

import { tx } from "@core/i18n";
import { findByProps } from "@metro";
import { NativeModules } from "react-native";

import { currentUserId, getStore } from "../common";

export const myVoiceChannel = (): string | undefined => getStore("SelectedChannelStore")?.getVoiceChannelId?.() ?? undefined;

export const STATUS_OPTIONS = [
    { label: tx("Do Not Disturb"), value: "dnd" },
    { label: tx("Idle"), value: "idle" },
    { label: tx("Invisible"), value: "invisible" },
    { label: tx("Online"), value: "online" },
];

export const BUTTON_OPTIONS = [
    { label: tx("Hidden"), value: "none" },
    { label: tx("Left of the message box"), value: "left" },
    { label: tx("Right of the message box"), value: "right" },
];

const statusSetting = () => findByProps("StatusSetting", "CustomStatusSetting")?.StatusSetting ?? findByProps("StatusSetting")?.StatusSetting;

const currentStatus = (): string => statusSetting()?.getSetting?.() ?? getStore("PresenceStore")?.getStatus?.(currentUserId()) ?? "online";

/**
 * Sets a status for a while and puts the previous one back afterwards, unless you changed it yourself in between
 */
export function statusHold() {
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

/** Discord's native sound player; changing it fails on devices where it is a read-only native object */
function soundManager() {
    const manager = NativeModules.DCDSoundManager;
    if (typeof manager?.prepare !== "function") throw new Error("Discord's sound player wasn't found");
    return manager;
}

export function patchSoundManager(key: string, patch: (manager: any) => () => unknown) {
    const manager = soundManager();
    const original = manager[key];
    const unpatch = patch(manager);
    if (manager[key] === original) {
        unpatch();
        throw new Error("Discord's sound player can't be changed on this device");
    }
    return unpatch;
}
