/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ValidReply: a reply whose message shows as "Message could not be loaded" gets that message fetched, the
 * way Discord fetches one, and shows it. PC fetches it when the pointer goes over the reply; a phone has no pointer,
 * so here it is "Load Replied Message" in the reply's long-press menu, shown only while Discord couldn't load it.
 * Discord's replies keep what they point to in ReferencedMessageStore; PC writes the fetched message into its cache,
 * which the phone's doesn't let anyone reach, so here what the store answers for that message is changed instead, for
 * as long as the plugin runs. A message that turns out to be gone shows as deleted, as on PC.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { after } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { getStore, moduleAt } from "../common";
import { addMessageAction, api, loadedMessages, onMessageRow, redrawMessage, toastError } from "../hooks";
import { repliedTo } from "./reply";

export default definePlugin({
    id: "endcord.valid-reply",
    name: "ValidReply",
    description: tx("Fixes \"Message could not be loaded\" on replies: long-press the reply and choose Load Replied Message."),
    icon: "ArrowAngleLeftUpIcon",
    tags: ["Chat", "Utility"],
    start({ cleanup }) {
        const store = getStore("ReferencedMessageStore");
        const { ReferencedMessageState: states } = moduleAt("modules/replies/ReferencedMessageStore.tsx") ?? {};
        const { createMessageRecord } = moduleAt("modules/messages/MessageRecordUtils.tsx") ?? {};
        if (typeof store?.getMessageByReference !== "function" || typeof store.getMessage !== "function") throw new Error("Discord's replies weren't found");
        const { LOADED, NOT_LOADED, DELETED } = states ?? {};
        if (![LOADED, NOT_LOADED, DELETED].every(s => typeof s === "number")) throw new Error("Discord's reply states weren't found");
        if (typeof createMessageRecord !== "function") throw new Error("Discord's message records weren't found");

        /** What each fetched message's ID now answers: the message, or that it was deleted */
        const fetched = new Map<string, { state: number; message?: any; }>();
        const fetching = new Set<string>();
        let running = true;

        /** Only what Discord couldn't load is changed; anything it has itself stays its own */
        const answer = (messageId: unknown, result: any) =>
            result?.state === NOT_LOADED && typeof messageId === "string" ? fetched.get(messageId) ?? result : result;

        const notLoaded = (message: any) => !!repliedTo(message) && store.getMessageByReference(message.messageReference)?.state === NOT_LOADED;

        /** Each reply to that message in the open chat is drawn again */
        const redrawReplies = (channelId: string, messageId: string) => {
            for (const m of loadedMessages(channelId)) {
                if (repliedTo(m)?.messageId === messageId) redrawMessage(channelId, m.id);
            }
        };

        cleanup(
            after("getMessageByReference", store, ([ref], result) => answer(ref?.message_id, result)),
            after("getMessage", store, ([, messageId], result) => answer(messageId, result)),
            // Rows drawn again for a reply are sent to the chat although the message itself didn't change
            onMessageRow("valid-reply", () => { }),
            addMessageAction({
                key: "valid-reply",
                icon: "RetryIcon",
                label: () => t("Load Replied Message"),
                visible: notLoaded,
                onPress: message => {
                    const ref = repliedTo(message);
                    if (!ref || fetching.has(ref.messageId)) return;
                    fetching.add(ref.messageId);
                    // Read only: one message, the way Discord fetches a reply it hasn't seen
                    api("get", `/channels/${ref.channelId}/messages?limit=1&around=${ref.messageId}`)
                        .then((found: any) => {
                            if (!running) return;
                            const reply = Array.isArray(found) ? found.find(m => m?.id === ref.messageId) : undefined;
                            if (reply) fetched.set(ref.messageId, { state: LOADED, message: createMessageRecord(reply) });
                            else {
                                fetched.set(ref.messageId, { state: DELETED });
                                showToast(t("The message this replies to was deleted"), findAssetId("CircleInformationIcon-primary"));
                            }
                            store.emitChange?.();
                            redrawReplies(message.channel_id, ref.messageId);
                        })
                        .catch(toastError)
                        .finally(() => fetching.delete(ref.messageId));
                },
            }),
            () => {
                running = false;
                const had = fetched.size > 0;
                fetched.clear();
                fetching.clear();
                // The replies show what Discord itself has again
                if (had) store.emitChange?.();
            },
        );
    },
});
