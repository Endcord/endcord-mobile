/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * NoDMWhileStreaming's choices, apart from Discord so they can be tested.
 */

// Discord's channel types, and the flag of a message sent with @silent (SUPPRESS_NOTIFICATIONS)
const DM = 1, GROUP_DM = 3;
export const SILENT_FLAG = 1 << 12;

/** Whether a channel of this type is hidden while you stream */
export const isHiddenType = (type: unknown, hideGroups: boolean) => type === DM || hideGroups && type === GROUP_DM;

const idOf = (item: any): string | undefined => typeof item === "string" ? item : item?.id ?? item?.channelId ?? item?.channel?.id;

/** The DM list without the hidden DMs: a list of channel IDs, or of channels */
export function withoutDms<T>(list: T[], hideGroups: boolean, typeOf: (id: string) => unknown): T[] {
    if (!Array.isArray(list)) return list;
    const kept = list.filter(item => {
        const id = idOf(item);
        const type = typeOf(id ?? "") ?? (item as any)?.type ?? (item as any)?.channel?.type;
        return !isHiddenType(type, hideGroups);
    });
    // The same list when nothing was hidden, so Discord doesn't draw it again for nothing
    return kept.length === list.length ? list : kept;
}

/** A message as Discord should see it while you stream: sent with @silent, so it makes no pop-up or sound */
export function silenced(message: any): any {
    const flags = Number(message?.flags) || 0;
    return flags & SILENT_FLAG ? message : { ...message, flags: flags | SILENT_FLAG };
}
