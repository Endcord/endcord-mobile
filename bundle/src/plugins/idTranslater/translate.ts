/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Which bare IDs in a message become mentions, links or channel references, as Endcord PC's ID Translater decides
 * (idTranslater/index.tsx there). Code in the message is left as it is written.
 */

export interface IdKinds {
    users: boolean;
    channels: boolean;
    roles: boolean;
    messages: boolean;
    minLength: number;
    maxLength: number;
}

export interface IdLookup {
    isUser(id: string): boolean;
    isChannel(id: string): boolean;
    isRole(id: string): boolean;
    /** The link to a message of this ID in the message's own channel */
    messageLink(id: string): string | undefined;
}

/** The longest message looked at: Discord's own limit for Nitro */
export const MAX_CONTENT = 4000;
/** Snowflakes have been 17 to 20 digits; the settings stay around that */
export const MIN_ID_LENGTH = 15, MAX_ID_LENGTH = 20;

const clampLength = (n: number) => Math.min(MAX_ID_LENGTH, Math.max(MIN_ID_LENGTH, Math.round(Number(n) || MIN_ID_LENGTH)));

/** Whether an ID is already part of a mention or a link, or written next to @ or # (PC's isIdInContext) */
export function isIdInContext(content: string, id: string, index: number): boolean {
    const before = content.substring(Math.max(0, index - 5), index);
    const after = content.substring(index + id.length, Math.min(content.length, index + id.length + 5));
    if (before.includes("<@") || before.includes("<#")) return true;
    if (/[:/.]/.test(before) || /[:/.]/.test(after)) return true;
    return before.endsWith("@") || before.endsWith("#") || after.startsWith("@") || after.startsWith("#");
}

function translatePart(content: string, kinds: IdKinds, lookup: IdLookup): string {
    const min = clampLength(Math.min(kinds.minLength, kinds.maxLength));
    const max = clampLength(Math.max(kinds.minLength, kinds.maxLength));
    // As on PC, only the first place each ID is written becomes a mention
    const done = new Set<string>();
    return content.replace(new RegExp(`\\b\\d{${min},${max}}\\b`, "g"), (id: string, index: number) => {
        if (done.has(id) || isIdInContext(content, id, index)) return id;
        const replacement = kinds.users && lookup.isUser(id) ? `<@${id}>`
            : kinds.channels && lookup.isChannel(id) ? `<#${id}>`
                : kinds.roles && lookup.isRole(id) ? `<@&${id}>`
                    : kinds.messages ? lookup.messageLink(id)
                        : undefined;
        if (!replacement) return id;
        done.add(id);
        return replacement;
    });
}

/**
 * The message with its IDs translated, or the same text when nothing changes. Like PC, a message that already has a
 * mention or channel reference in it is left alone
 */
export function translateIds(content: string, kinds: IdKinds, lookup: IdLookup): string {
    if (!content || !/\d/.test(content) || content.length > MAX_CONTENT) return content;
    if (!kinds.users && !kinds.channels && !kinds.roles && !kinds.messages) return content;
    if (content.includes("<@") || content.includes("<#")) return content;
    // Code blocks and inline code show IDs as they are written
    return content.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) => i % 2 ? part : translatePart(part, kinds, lookup)).join("");
}
