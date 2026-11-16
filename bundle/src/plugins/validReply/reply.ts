/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Discord's message type for a reply, and the reference type that is a reply rather than a forward */
const REPLY = 19;
const REFERENCE_DEFAULT = 0;

const isId = (value: unknown): value is string => typeof value === "string" && /^\d{1,25}$/.test(value);

/** The message a reply answers, from Discord's record (messageReference) or its API (message_reference) */
export function repliedTo(message: any): { channelId: string; messageId: string; } | undefined {
    if (message?.type !== REPLY) return undefined;
    const ref = message.messageReference ?? message.message_reference;
    if (!ref || (ref.type ?? REFERENCE_DEFAULT) !== REFERENCE_DEFAULT) return undefined;
    // A reference names its channel; one that doesn't is to a message in the reply's own
    const channelId = ref.channel_id ?? message.channel_id;
    return isId(channelId) && isId(ref.message_id) ? { channelId, messageId: ref.message_id } : undefined;
}
