/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ReplyChain: the whole conversation a reply answers, from the first message down, in one window. PC
 * opens it from the message's right-click menu; here it is "Show Reply Chain" in the message's long-press menu, and
 * the window is a page with each message's author, time and text. Tapping a message jumps to it in the chat.
 * Messages already loaded are taken from Discord; the others are fetched one at a time, as PC does, and a fetched
 * message's own parent comes along with it when Discord sends it, which saves a request.
 */

import { t, tx } from "@core/i18n";
import formatDate from "@lib/utils/formatDate";
import { TableRow, TableRowGroup, Text } from "@metro/common/components";
import { useEdgeInsets } from "@ui/insets";
import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { definePlugin } from "../api";
import { getStore, guildRoles } from "../common";
import { addMessageAction, api, getChannel, jumpTo, toastError } from "../hooks";
import { timeOf } from "../shared/rows";
import { openPage } from "../ui/pages";
import { type ChainEnd, type ChainMessage, readableMentions, type Reference, replyReference, shownText, walkChain } from "./chain";

/** Bumped when the plugin stops, so a chain still loading stops too */
let generation = 0;

function nameOf(author: any, guildId?: string): string {
    const id = author?.id;
    const nick = guildId && id ? getStore("GuildMemberStore")?.getNick?.(guildId, id) : undefined;
    return String(nick || author?.globalName || author?.global_name || author?.username || id || "?");
}

/** From a message Discord has: its record, or the message as its API sends it */
function toChain(message: any, guildId?: string): ChainMessage {
    return {
        id: String(message.id),
        channelId: String(message.channel_id),
        authorId: String(message.author?.id ?? ""),
        name: nameOf(message.author, guildId),
        content: typeof message.content === "string" ? message.content : "",
        timestamp: timeOf(message),
        attachments: Array.isArray(message.attachments) ? message.attachments.length : 0,
        reference: replyReference(message),
        parent: message.referenced_message ?? undefined,
    };
}

/** The message a reference points to: from the chat, Discord's replies, what came with the last one, or its API */
async function load(ref: Reference, child: ChainMessage, guildId?: string): Promise<ChainMessage | null> {
    const stored = getStore("MessageStore")?.getMessage?.(ref.channel_id, ref.message_id);
    if (stored) return toChain(stored, guildId);
    const referenced = getStore("ReferencedMessageStore")?.getMessage?.(ref.channel_id, ref.message_id)?.message;
    if (referenced?.id === ref.message_id) return toChain(referenced, guildId);
    if (child.parent?.id === ref.message_id && child.parent?.author) return toChain(child.parent, guildId);
    // Read only: one message, the way Discord fetches a reply it hasn't seen
    const found: any[] = await api("get", `/channels/${ref.channel_id}/messages?limit=1&around=${ref.message_id}`);
    const message = Array.isArray(found) ? found.find(m => m?.id === ref.message_id) : undefined;
    return message?.author ? toChain(message, guildId) : null;
}

const names = (guildId?: string) => ({
    user: (id: string) => {
        const user = getStore("UserStore")?.getUser?.(id);
        return user ? nameOf(user, guildId) : undefined;
    },
    channel: (id: string) => getChannel(id)?.name || undefined,
    role: (id: string) => (guildId ? guildRoles(guildId)[id]?.name : undefined) || undefined,
});

const NOTES: Partial<Record<ChainEnd, string>> = {
    missing: tx("The message before this one was deleted."),
    failed: tx("The message before this one couldn't be loaded."),
    long: tx("The chain goes back further than this."),
};

function ChainPage({ start, close }: { start: any; close: () => void; }) {
    const { bottom } = useEdgeInsets();
    const guildId: string | undefined = getChannel(start.channel_id)?.guild_id;
    const [chain, setChain] = useState<ChainMessage[]>(() => [toChain(start, guildId)]);
    const [end, setEnd] = useState<ChainEnd | "loading">("loading");

    useEffect(() => {
        let closed = false;
        const started = generation;
        const stopped = () => closed || started !== generation;
        walkChain(toChain(start, guildId), (ref, child) => load(ref, child, guildId), list => {
            if (!stopped()) setChain(list);
        }, stopped)
            .then(result => {
                if (!stopped()) setEnd(result);
            })
            .catch(() => {
                if (!stopped()) setEnd("failed");
            });
        return () => {
            closed = true;
        };
    }, []);

    const resolver = names(guildId);
    const note = end !== "loading" ? NOTES[end] : undefined;
    const title = end === "loading"
        ? t("Finding the messages this one replies to…")
        : t("{count} messages, the first one at the top.", { count: chain.length });

    return <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 38 + bottom }}>
        <TableRowGroup title={title}>
            {note ? <TableRow label={<Text variant="text-md/medium" color="text-muted">{t(note)}</Text>} /> : null}
            {chain.map(m => {
                const text = shownText(readableMentions(m.content.slice(0, 2000), resolver))
                    || (m.attachments ? t("Sent an attachment") : t("(no text)"));
                const time = formatDate(m.timestamp, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                return <TableRow
                    key={m.id}
                    label={`${m.id === start.id ? "➤ " : ""}${m.name} · ${time}`}
                    subLabel={text}
                    arrow={true}
                    onPress={() => {
                        close();
                        jumpTo(m.channelId, m.id);
                    }}
                />;
            })}
        </TableRowGroup>
    </ScrollView>;
}

export default definePlugin({
    id: "endcord.reply-chain",
    name: "ReplyChain",
    description: tx("Long-press a reply to see the whole conversation it answers, from the first message down, on one page."),
    icon: "ChatIcon",
    tags: ["Chat", "Utility"],
    start({ cleanup }) {
        cleanup(
            () => void generation++,
            addMessageAction({
                key: "reply-chain",
                icon: "ThreadIcon",
                label: () => t("Show Reply Chain"),
                visible: message => !!replyReference(message),
                onPress: message => {
                    const pressed = generation;
                    // Once the message's sheet has closed
                    setTimeout(() => {
                        if (pressed !== generation) return;
                        try {
                            openPage(t("Reply chain"), ({ close }) => <ChainPage start={message} close={close} />);
                        } catch (e) {
                            toastError(e);
                        }
                    }, 300);
                },
            }),
        );
    },
});
