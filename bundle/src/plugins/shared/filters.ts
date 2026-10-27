/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins that decide what reaches you: messages, pings, stickers, calls and profile themes.
 *
 * What more than one of the ClientSideBlock, NoBlockedMessages, SilenceUsers, StickerBlocker, ReplyPingControl and IgnoreCalls plugins uses.
 */

import { getStore } from "../common";

/** "1, 2,3 4" to a set of IDs */
export const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));

export const isBlocked = (userId?: string) => !!userId && !!getStore("RelationshipStore")?.isBlocked?.(userId);
