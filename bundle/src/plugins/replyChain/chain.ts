/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Following a reply back to the message that started the conversation, as Endcord PC's ReplyChain does.
 */

/** Discord's message type for a reply, and the reference type that is a reply rather than a forward */
export const REPLY = 19;
const REFERENCE_DEFAULT = 0;
/** Far enough to see how a conversation started, without fetching a whole channel */
export const MAX_DEPTH = 25;
/** The most of a message's text shown in the list */
export const MAX_TEXT = 1000;

export interface Reference {
    channel_id: string;
    message_id: string;
    type?: number;
}

export interface ChainMessage {
    id: string;
    channelId: string;
    authorId: string;
    name: string;
    content: string;
    timestamp: number;
    attachments: number;
    /** The message this one replies to */
    reference?: Reference;
    /** That message itself, when Discord's API sent it along */
    parent?: any;
}

const isId = (value: unknown): value is string => typeof value === "string" && /^\d{1,25}$/.test(value);

/** What a message replies to, from Discord's record (messageReference) or its API (message_reference) */
export function replyReference(message: any): Reference | undefined {
    if (message?.type !== REPLY) return undefined;
    const ref = message.messageReference ?? message.message_reference;
    if (!ref || (ref.type ?? REFERENCE_DEFAULT) !== REFERENCE_DEFAULT) return undefined;
    // A reference names its channel; one that doesn't is to a message in the reply's own
    const channelId = ref.channel_id ?? message.channel_id;
    if (!isId(channelId) || !isId(ref.message_id)) return undefined;
    return { channel_id: channelId, message_id: ref.message_id, type: ref.type };
}

export type ChainEnd = "done" | "missing" | "failed" | "long" | "stopped";

/**
 * Walks back from a reply, the first message ending up first. `load` gives the message a reference points to, null
 * when it was deleted, and throws when it couldn't be loaded. `onStep` gets the chain so far after each message.
 */
export async function walkChain(
    start: ChainMessage,
    load: (ref: Reference, child: ChainMessage) => Promise<ChainMessage | null>,
    onStep: (chain: ChainMessage[]) => void,
    stopped: () => boolean,
): Promise<ChainEnd> {
    let chain = [start];
    const seen = new Set([start.id]);
    while (chain[0].reference) {
        if (chain.length >= MAX_DEPTH) return "long";
        let next: ChainMessage | null;
        try {
            next = await load(chain[0].reference, chain[0]);
        } catch {
            return stopped() ? "stopped" : "failed";
        }
        if (stopped()) return "stopped";
        if (!next) return "missing";
        // A message can only answer an earlier one; anything else ends the chain rather than going round
        if (seen.has(next.id)) return "done";
        seen.add(next.id);
        chain = [next, ...chain];
        onStep(chain);
    }
    return "done";
}

export interface Names {
    user(id: string): string | undefined;
    channel(id: string): string | undefined;
    role(id: string): string | undefined;
}

/** Mentions and custom emojis as Discord shows them, rather than as their codes */
export function readableMentions(text: string, names: Names): string {
    return text.replace(/<(@!?|@&|#)(\d{1,25})>|<a?:(\w{1,32}):\d{1,25}>/g, (code, kind?: string, id?: string, emoji?: string) => {
        if (emoji) return `:${emoji}:`;
        const name = kind === "#" ? names.channel(id!) : kind === "@&" ? names.role(id!) : names.user(id!);
        return name ? `${kind === "#" ? "#" : "@"}${name}` : code;
    });
}

/** Text from someone's message for a list: no longer than MAX_TEXT, without long runs of empty lines */
export function shownText(content: unknown): string {
    if (typeof content !== "string") return "";
    const text = content.slice(0, MAX_TEXT + 1).replace(/\n{3,}/g, "\n\n").trim();
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}
