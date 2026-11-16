/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's StickerPaste: a sticker you pick isn't sent right away, it goes with the message you write next. PC puts
 * it in the message box; the phone's message box has no place for stickers, so a sticker button appears beside it
 * while stickers are waiting, to send them on their own or take them back.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { useEffect, useReducer } from "react";

import { definePlugin } from "../api";
import { addChatButton, getChatInputActionButton, getStore } from "../common";
import { generatedIcon, MessageActions, onSend, toastError } from "../hooks";
import { choose } from "../ui/dialogs";
import { addStickers, hasText } from "./pending";

/** The stickers waiting in each chat */
const waiting = new Map<string, string[]>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());

/**
 * The plugin's own sends of waiting stickers, by chat and stickers, so they go through rather than being held again:
 * Discord may pass them on to sendMessage a moment later. Forgotten after a while in case it doesn't.
 */
const ownSends = new Map<string, ReturnType<typeof setTimeout>>();
const sendKey = (channelId: string, stickerIds: unknown) => `${channelId}:${Array.isArray(stickerIds) ? stickerIds.join(",") : ""}`;

function expectOwn(key: string) {
    clearTimeout(ownSends.get(key));
    ownSends.set(key, setTimeout(() => ownSends.delete(key), 15_000));
}

function takeOwn(key: string) {
    if (!ownSends.has(key)) return false;
    clearTimeout(ownSends.get(key));
    ownSends.delete(key);
    return true;
}

/**
 * The plugin's own sends that sendStickers took and is sending now, which it passes on to sendMessage: let through
 * there too, until sendStickers is done
 */
const passing = new Set<string>();

function hold(channelId: string, stickerIds: unknown) {
    const { stickers, full } = addStickers(waiting.get(channelId) ?? [], stickerIds);
    if (stickers.length) waiting.set(channelId, stickers);
    changed();
    showToast(full ? t("A message can carry 3 stickers") : t("Sticker added: it's sent with your next message"), findAssetId("StickerIcon"));
}

const stickerOptions = (stickerIds: string[]) => MessageActions()?.getSendMessageOptionsForStickers?.(stickerIds) ?? { stickerIds };

function sendNow(channelId: string) {
    const stickers = waiting.get(channelId) ?? [];
    if (!stickers.length) return;
    const actions = MessageActions();
    expectOwn(sendKey(channelId, stickers));
    const sent = typeof actions?.sendStickers === "function"
        ? actions.sendStickers(channelId, stickers)
        : actions?.sendMessage(channelId, { content: "", tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, undefined, stickerOptions(stickers));
    waiting.delete(channelId);
    changed();
    Promise.resolve(sent).catch(toastError);
}

function stickerName(id: string) {
    return getStore("StickersStore")?.getStickerById?.(id)?.name ?? getStore("GuildStickersStore")?.getStickerById?.(id)?.name ?? id;
}

function WaitingStickers() {
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        const selected = getStore("SelectedChannelStore");
        listeners.add(redraw);
        selected?.addChangeListener?.(redraw);
        return () => {
            listeners.delete(redraw);
            selected?.removeChangeListener?.(redraw);
        };
    }, []);
    const channelId: string | undefined = getStore("SelectedChannelStore")?.getChannelId?.();
    const stickers = channelId ? waiting.get(channelId) ?? [] : [];
    const Button = getChatInputActionButton();
    const Icon = generatedIcon("StickerIcon");
    if (!channelId || !stickers.length || !Button || !Icon) return null;
    return <Button
        accessibilityLabel={t("Stickers waiting: {count}", { count: stickers.length })}
        IconComponent={Icon}
        onPress={() => choose(stickers.map(stickerName).join(", "), [
            { label: t("Send the stickers now"), value: "send", icon: "SendMessageIcon" },
            { label: t("Remove the stickers"), value: "remove", icon: "TrashIcon", danger: true },
        ], action => {
            try {
                if (action === "send") sendNow(channelId);
                else {
                    waiting.delete(channelId);
                    changed();
                }
            } catch (e) {
                toastError(e);
            }
        })}
    />;
}

export default definePlugin({
    id: "endcord.sticker-paste",
    name: "StickerPaste",
    description: tx("Makes picking a sticker in the sticker picker add it to your next message instead of sending it at once. A sticker button beside the message box shows the stickers waiting."),
    icon: "StickerIcon",
    tags: ["Emotes", "Chat"],
    start({ cleanup, logger }) {
        const actions = MessageActions();
        if (typeof actions?.sendMessage !== "function") throw new Error(t("Discord's message actions weren't found"));
        if (typeof actions.sendStickers === "function") {
            cleanup(instead("sendStickers", actions, function (this: any, args: any[], original: Function) {
                const [channelId, stickerIds, content] = args;
                if (typeof channelId !== "string" || hasText(content)) return original.apply(this, args);
                const key = sendKey(channelId, stickerIds);
                if (!takeOwn(key)) {
                    hold(channelId, stickerIds);
                    return Promise.resolve();
                }
                // Taken, so picking the same stickers again later is held as usual
                passing.add(key);
                const done = () => void passing.delete(key);
                try {
                    const sent = original.apply(this, args);
                    Promise.resolve(sent).then(done, done);
                    return sent;
                } catch (e) {
                    done();
                    throw e;
                }
            }));
        } else {
            logger.warn("Discord's sendStickers wasn't found; stickers sent as messages are still held");
        }
        cleanup(
            onSend("sticker-paste", (content, { channelId, editing, options }) => {
                if (editing || !options) return;
                const picked: unknown = options.stickerIds;
                if (Array.isArray(picked) && picked.length && (passing.has(sendKey(channelId, picked)) || takeOwn(sendKey(channelId, picked)))) return;
                // A sticker picked on its own: held for the next message
                if (Array.isArray(picked) && picked.length && !hasText(content)) {
                    hold(channelId, picked);
                    return null;
                }
                const stickers = waiting.get(channelId);
                if (!stickers?.length) return;
                const { stickers: all } = addStickers(Array.isArray(picked) ? picked.filter(id => typeof id === "string") : [], stickers);
                Object.assign(options, stickerOptions(all));
                waiting.delete(channelId);
                changed();
            }, 96),
            addChatButton({ key: "sticker-paste", side: () => "right", render: WaitingStickers }),
            () => {
                waiting.clear();
                for (const timer of ownSends.values()) clearTimeout(timer);
                ownSends.clear();
                passing.clear();
                changed();
            },
        );
    },
});
