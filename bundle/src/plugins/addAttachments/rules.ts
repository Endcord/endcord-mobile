/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Which messages AddAttachments can add files to, as Endcord PC decides.
 */

import { MAX_ATTACHMENTS } from "../fileUpload/files";

const DEFAULT = 0;
const REPLY = 19;
const IS_VOICE_MESSAGE = 1 << 13;
/** A forwarded message's reference, which can't be edited */
const FORWARD = 1;

/** How many more files a message with `count` of them can take */
export const room = (count: number) => Math.max(0, MAX_ATTACHMENTS - count);

/** Your own plain message or reply, sent (not one still on its way), not a voice message or a forward, with room left */
export function canAddAttachments(message: any, myId: string | undefined): boolean {
    if (!message || !myId || message.author?.id !== myId) return false;
    if (message.type !== DEFAULT && message.type !== REPLY) return false;
    if ((Number(message.flags) & IS_VOICE_MESSAGE) !== 0) return false;
    if (message.state && message.state !== "SENT") return false;
    if (!/^\d{17,20}$/.test(String(message.id))) return false;
    if ((message.messageReference ?? message.message_reference)?.type === FORWARD || message.messageSnapshots?.length) return false;
    return room(Array.isArray(message.attachments) ? message.attachments.length : 0) > 0;
}
