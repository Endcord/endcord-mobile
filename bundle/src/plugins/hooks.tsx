/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The extension points most of Endcord's plugins are built on, each patched once and shared, like Endcord PC's
 * MessageEvents, Commands and context menu APIs:
 *  - onSend: change, or stop, a message before it is sent or edited
 *  - onMessageRow: change how a message is drawn in the chat
 *  - addMessageAction: a row in the message long-press sheet
 *  - command: a slash command whose texts are translated
 * Every callback is isolated: one that throws is logged and skipped, the rest still run.
 */

import { t } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { registerCommand } from "@lib/api/commands";
import { ApplicationCommandOptionType, Argument, CommandContext } from "@lib/api/commands/types";
import { intercept } from "@lib/api/flux";
import { after, instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByName, findByProps } from "@metro";
import { clipboard, messageUtil } from "@metro/common";
import { ActionSheet, ActionSheetRow } from "@metro/common/components";
import type { ReactElement, ReactNode } from "react";
import { Linking, NativeModules, processColor, Share } from "react-native";

import { dispatchSoon, getStore, moduleAt } from "./common";

// ---------------------------------------------------------------------------------------------------------------------
// Discord's modules
// ---------------------------------------------------------------------------------------------------------------------

export const MessageActions = () => findByProps("sendMessage", "editMessage");
export const ReactionActions = () => findByProps("addReaction", "removeReaction") ?? moduleAt("actions/ReactionActionCreators.tsx")?.default;
export const HTTP = () => findByProps("getAPIBaseURL", "get");

/** A REST request to Discord's API, with the app's session */
export async function api(method: "get" | "post" | "patch" | "put" | "del", url: string, body?: unknown): Promise<any> {
    const http = HTTP();
    if (!http?.[method]) throw new Error("Discord's HTTP module wasn't found");
    const res = await http[method]({ url, body, oldFormErrors: true });
    return res?.body ?? res;
}

/**
 * A readable message for an error. Discord's API rejects with its response rather than an Error, which would
 * otherwise show as "[object Object]".
 */
export function describeError(e: unknown): string {
    if (e instanceof Error) return e.message;
    const error = e as any;
    const message = error?.body?.message ?? error?.message ?? error?.text;
    if (typeof message === "string" && message) return message;
    if (typeof error?.status === "number") return t("The request failed ({status})", { status: error.status });
    return String(e);
}

/** Shows an error as a toast */
export const toastError = (e: unknown) => void showToast(describeError(e), findAssetId("CircleXIcon-primary"));

export const currentChannelId = (): string | undefined => getStore("SelectedChannelStore")?.getChannelId?.();
export const getChannel = (id?: string) => (id ? getStore("ChannelStore")?.getChannel?.(id) : undefined);
export const getUser = (id?: string) => (id ? getStore("UserStore")?.getUser?.(id) : undefined);
export const getGuild = (id?: string) => (id ? getStore("GuildStore")?.getGuild?.(id) : undefined);

export function displayName(user: any): string {
    if (!user) return "?";
    return user.globalName ?? user.global_name ?? user.username ?? user.id;
}

/** A message only you see, from Clyde */
export function botMessage(channelId: string, content: string) {
    messageUtil?.sendBotMessage?.(channelId, content);
}

export function copy(text: string, message?: string) {
    clipboard.setString(text);
    showToast(message ?? t("Copied to clipboard"), findAssetId("CopyIcon") ?? findAssetId("LinkIcon"));
}

export const openUrl = (url: string) => Linking.openURL(url);

/**
 * The longest text Android's share sheet takes: it travels in one binder transaction, which fails past about 1 MB, at
 * two bytes a character
 */
export const MAX_SHARE_LENGTH = 200_000;

/** Opens Android's share sheet */
export function share(message: string, title?: string) {
    if (message.length > MAX_SHARE_LENGTH) throw new Error(t("This is too long to share at once ({size} characters)", { size: message.length.toLocaleString() }));
    return Share.share({ message, title });
}

export function generatedIcon(name: string) {
    return moduleAt(`design/components/Icon/native/redesign/generated/${name}.tsx`)?.[name];
}

let nextSoundId = 7300;

/** Plays a sound from a link with Discord's own player */
export function playSound(url: string, volume = 1) {
    const player = NativeModules.DCDSoundManager;
    if (typeof player?.prepare !== "function") return;
    const id = nextSoundId++;
    player.prepare(url, "music", id, (error: unknown, sound?: { duration?: number; }) => {
        if (error) return;
        player.setVolume?.(id, Math.min(Math.max(volume, 0), 1));
        player.play(id);
        // Released once it has played, so sounds don't pile up
        setTimeout(() => player.release?.(id), (sound?.duration ?? 5) * 1000 + 2000);
    });
}

/** A color for the native chat, which takes Android's packed ARGB numbers */
export function nativeColor(color: string): number | undefined {
    const value = processColor(color);
    return typeof value === "number" ? value : undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------------------------------

/** Sends a message as you, through the same path as the chat box (so onSend transforms run) */
export function send(channelId: string, content: string, options: Record<string, unknown> = {}) {
    return MessageActions()?.sendMessage(channelId, { content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, undefined, options);
}

/** Types text into the chat box of a channel, where the cursor is. False when that chat box isn't open. */
export function insertText(channelId: string, text: string): boolean {
    const input = findByProps("getBestActiveInputForChannelId")?.getBestActiveInputForChannelId?.(channelId);
    if (typeof input?.insertText !== "function") return false;
    input.insertText(text);
    return true;
}

export function edit(channelId: string, messageId: string, content: string) {
    return MessageActions()?.editMessage(channelId, messageId, { content });
}

export function deleteMessage(channelId: string, messageId: string) {
    return MessageActions()?.deleteMessage(channelId, messageId);
}

export interface Emoji {
    id?: string | null;
    name: string;
    animated?: boolean;
}

/** Parses "😀", ":name:" style text isn't resolved; "<:name:id>" and "<a:name:id>" are */
export function parseEmoji(text: string): Emoji | undefined {
    const custom = text.trim().match(/^<(a?):(\w+):(\d+)>$/);
    if (custom) return { id: custom[3], name: custom[2], animated: !!custom[1] };
    const trimmed = text.trim();
    return trimmed ? { id: null, name: trimmed } : undefined;
}

export function react(channelId: string, messageId: string, emoji: Emoji) {
    return ReactionActions()?.addReaction(channelId, messageId, { id: emoji.id ?? null, name: emoji.name, animated: !!emoji.animated });
}

/** The messages of a channel that are loaded, oldest first */
export function loadedMessages(channelId: string): any[] {
    const messages = getStore("MessageStore")?.getMessages?.(channelId);
    return messages?.toArray?.() ?? messages?._array ?? [];
}

export function jumpTo(channelId: string, messageId: string) {
    const jumper = MessageActions()?.jumpToMessage ? MessageActions() : findByProps("jumpToMessage");
    jumper?.jumpToMessage?.({ channelId, messageId, flash: true, returnMessageId: undefined });
}

export function messageLink(channelId: string, messageId: string) {
    const guildId = getChannel(channelId)?.guild_id;
    return `https://discord.com/channels/${guildId ?? "@me"}/${channelId}/${messageId}`;
}

/** Parses a discord.com message link */
export function parseMessageLink(link: string) {
    const match = link.match(/discord(?:app)?\.com\/channels\/(@me|\d+)\/(\d+)\/(\d+)/);
    return match ? { guildId: match[1] === "@me" ? undefined : match[1], channelId: match[2], messageId: match[3] } : undefined;
}

/** When a snowflake ID was made */
export const snowflakeTime = (id: string) => Math.floor(Number(id) / 4194304) + 1420070400000;

/** The day a moment falls on where you are, like 2026-10-26 (toISOString would give the day in UTC) */
export function localDay(ms = Date.now()) {
    const date = new Date(ms);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A snowflake for now, for messages that only exist in your client; exact, since it's too big for a number */
export const localSnowflake = () => String(BigInt(Date.now() - 1420070400000) << 22n | BigInt(Math.floor(Math.random() * 4194304)));

/** Puts a message into the chat that only you see, as if it was sent by someone (like Endcord PC's FakeMessage) */
export function receiveLocalMessage(channelId: string, message: Record<string, any>) {
    (MessageActions()?.receiveMessage ?? messageUtil?.receiveMessage)?.(channelId, message);
}

// ---------------------------------------------------------------------------------------------------------------------
// onSend
// ---------------------------------------------------------------------------------------------------------------------

export interface SendContext {
    channelId: string;
    /** True for edits, which only change the text */
    editing: boolean;
    /** Discord's message data; plugins may change fields other than content */
    message: { content: string; [key: string]: any; };
    /** Discord's send options (flags, allowedMentions, messageReference...), for new messages only */
    options?: { flags?: number; allowedMentions?: any; messageReference?: any; [key: string]: any; };
}

/** The new text, nothing to keep it, or null to not send the message at all */
export type SendTransform = (content: string, ctx: SendContext) => string | void | null | Promise<string | void | null>;

const transforms = new Map<string, { order: number; fn: SendTransform; }>();
let unpatchSend: (() => void) | null = null;

export async function runTransforms(channelId: string, message: any, editing: boolean, options?: SendContext["options"]): Promise<boolean> {
    if (!message || typeof message.content !== "string") return true;
    const sorted = [...transforms.entries()].sort((a, b) => a[1].order - b[1].order);
    for (const [key, { fn }] of sorted) {
        try {
            const result = await fn(message.content, { channelId, editing, message, options });
            if (result === null) return false;
            if (typeof result === "string") message.content = result;
        } catch (e) {
            console.error(`[Endcord] ${key} couldn't process a message`, e);
        }
    }
    return true;
}

function patchSend() {
    if (unpatchSend) return;
    const actions = MessageActions();
    if (!actions) throw new Error("Discord's message actions weren't found");
    const unpatches = [
        instead("sendMessage", actions, async function (this: any, args, original) {
            if (args[3] == null || typeof args[3] !== "object") args[3] = {};
            if (!(await runTransforms(args[0], args[1], false, args[3]))) return;
            return original.apply(this, args);
        }),
        instead("editMessage", actions, async function (this: any, args, original) {
            if (!(await runTransforms(args[0], args[2], true))) return;
            return original.apply(this, args);
        }),
    ];
    unpatchSend = () => unpatches.forEach(u => u());
}

/**
 * Runs before every message you send or edit. Lower `order` runs first; text changes (0) come before encodings (50)
 * and splitting (100).
 */
export function onSend(key: string, fn: SendTransform, order = 0) {
    patchSend();
    transforms.set(key, { order, fn });
    return () => {
        transforms.delete(key);
        if (!transforms.size) {
            unpatchSend?.();
            unpatchSend = null;
        }
    };
}

/** Text inside code blocks and inline code is left alone by most text transforms, like on Endcord PC */
export function outsideCode(content: string, fn: (text: string) => string): string {
    return content.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) => i % 2 ? part : fn(part)).join("");
}

// ---------------------------------------------------------------------------------------------------------------------
// onIncomingMessage
// ---------------------------------------------------------------------------------------------------------------------

/** null hides the message, an object replaces it, nothing keeps it as it is */
export type IncomingFilter = (message: any) => any;

// Actions that bring a list of messages into the chat: from the server, the cache, search and jumps
const MESSAGE_LISTS = new Set(["LOAD_MESSAGES_SUCCESS", "LOAD_MESSAGES_SUCCESS_CACHED", "LOCAL_MESSAGES_LOADED", "LOAD_MESSAGES_AROUND_SUCCESS", "LOAD_RECENT_MENTIONS_SUCCESS"]);
const incomingFilters = new Map<string, IncomingFilter>();
let unpatchIncoming: (() => void) | null = null;

function filterMessage(message: any): any {
    let current = message;
    for (const [key, fn] of incomingFilters) {
        try {
            const result = fn(current);
            if (result === null) return null;
            if (result && typeof result === "object") current = result;
        } catch (e) {
            console.error(`[Endcord] ${key} couldn't check a message`, e);
        }
    }
    return current;
}

/**
 * Sees every message before Discord stores it, as it arrives or when a chat loads. Changes only apply to messages that
 * arrive after the plugin started; reopening a chat loads its messages again.
 */
export function onIncomingMessage(key: string, fn: IncomingFilter) {
    if (!unpatchIncoming) {
        // One interceptor per action type, so the actions that don't carry messages never reach these
        const unpatches = [
            intercept(payload => {
                if (!payload.message) return;
                const result = filterMessage(payload.message);
                if (result === null) return false;
                return result !== payload.message ? { message: result } : undefined;
            }, { type: "MESSAGE_CREATE" }),
            ...[...MESSAGE_LISTS].map(type => intercept(payload => {
                if (!Array.isArray(payload.messages)) return;
                let changed = false;
                const messages = payload.messages.flatMap((m: any) => {
                    const result = filterMessage(m);
                    if (result !== m) changed = true;
                    return result === null ? [] : [result];
                });
                return changed ? { messages } : undefined;
            }, { type })),
        ];
        unpatchIncoming = () => unpatches.forEach(u => u());
    }
    incomingFilters.set(key, fn);
    return () => {
        incomingFilters.delete(key);
        if (!incomingFilters.size) {
            unpatchIncoming?.();
            unpatchIncoming = null;
        }
    };
}

/** Removes a message from your chat without deleting it; it comes back when the chat is loaded again */
export function hideLocally(channelId: string, messageId: string) {
    dispatchSoon({ type: "MESSAGE_DELETE", id: messageId, channelId, endcordLocal: true });
}

// ---------------------------------------------------------------------------------------------------------------------
// onMessageRow
// ---------------------------------------------------------------------------------------------------------------------

/** The message as Discord's native chat draws it, and the message record it was made from */
export type RowDecorator = (row: any, message: any) => void;

const MESSAGE_ROW = 1;
// Tells native the row changed, though Discord thinks it's the same message
const ROW_CHANGED = 2;
const decorators = new Map<string, RowDecorator>();
const needsRedraw = new Set<string>();
let unpatchRows: (() => void) | null = null;

/** Draws a message again, so decorators' changes to it show */
export function redrawMessage(channelId: string, messageId: string) {
    needsRedraw.add(messageId);
    dispatchSoon({ type: "MESSAGE_UPDATE", message: { id: messageId, channel_id: channelId } });
}

let redrawQueued = false;

/** Draws the open chat's messages again, once for all the changes made in the same moment */
export function redrawChannel() {
    if (redrawQueued) return;
    redrawQueued = true;
    setTimeout(() => {
        redrawQueued = false;
        const channelId = currentChannelId();
        if (!channelId) return;
        for (const message of loadedMessages(channelId).slice(-60)) redrawMessage(channelId, message.id);
    }, 100);
}

/** Changes every message row Discord generates for the chat (text color, timestamp, content nodes...) */
export function onMessageRow(key: string, fn: RowDecorator) {
    if (!unpatchRows) {
        const RowManager = findByName("RowManager");
        if (typeof RowManager?.prototype?.generate !== "function") throw new Error("Discord's message rows weren't found");
        unpatchRows = after("generate", RowManager.prototype, ([args], row) => {
            const message = row?.type === MESSAGE_ROW ? row.message : undefined;
            if (!message || !args?.message) return;
            if (needsRedraw.delete(message.id)) row.changeType = ROW_CHANGED;
            for (const [k, decorate] of decorators) {
                try {
                    decorate(message, args.message);
                } catch (e) {
                    console.error(`[Endcord] ${k} couldn't decorate a message`, e);
                }
            }
        });
    }
    decorators.set(key, fn);
    redrawChannel();
    return () => {
        decorators.delete(key);
        // The open chat loses the decoration right away, rather than message by message as it redraws
        redrawChannel();
        // Once those redraws have gone through
        setTimeout(() => {
            if (decorators.size) return;
            unpatchRows?.();
            unpatchRows = null;
            needsRedraw.clear();
        }, 1000);
    };
}

/** A content node Discord's native chat draws as plain text */
export const textNode = (content: string) => ({ type: "text", content });

/** Adds text after the time of a message */
export function appendToTimestamp(row: any, text: string) {
    if (typeof row.timestamp === "string" && text && !row.timestamp.endsWith(text)) row.timestamp = `${row.timestamp}${text}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// addMessageAction
// ---------------------------------------------------------------------------------------------------------------------

export interface MessageAction {
    key: string;
    label: (message: any, channel: any) => string;
    icon: string;
    danger?: boolean;
    visible?: (message: any, channel: any) => boolean;
    onPress: (message: any, channel: any) => void;
}

const messageActions = new Map<string, MessageAction>();
let unpatchSheet: (() => void) | null = null;

function findSheet(element: any): any {
    if (!element || typeof element !== "object") return;
    if (Array.isArray(element)) {
        for (const child of element) {
            const found = findSheet(child);
            if (found) return found;
        }
        return;
    }
    if (element.type === ActionSheet) return element;
    return findSheet(element.props?.children);
}

function hideSheet() {
    findByProps("openLazy", "hideActionSheet")?.hideActionSheet?.();
}

function EndcordActions({ message, channel }: { message: any; channel: any; }) {
    const rows: ReactNode[] = [];
    for (const action of messageActions.values()) {
        try {
            if (action.visible && !action.visible(message, channel)) continue;
            const Icon = generatedIcon(action.icon);
            rows.push(<ActionSheetRow
                key={action.key}
                label={action.label(message, channel)}
                variant={action.danger ? "danger" : undefined}
                icon={Icon ? <ActionSheetRow.Icon IconComponent={Icon} /> : undefined}
                onPress={() => {
                    hideSheet();
                    try {
                        action.onPress(message, channel);
                    } catch (e) {
                        console.error(`[Endcord] ${action.key} failed`, e);
                    }
                }}
            />);
        } catch (e) {
            console.error(`[Endcord] ${action.key} couldn't be shown`, e);
        }
    }
    if (!rows.length) return null;
    return <ActionSheetRow.Group>{rows}</ActionSheetRow.Group>;
}

/** A row in the sheet that opens when you long-press a message */
export function addMessageAction(action: MessageAction) {
    if (!unpatchSheet) {
        const module = findByName("LongPressMessageActionSheet", false)
            ?? moduleAt("modules/messages/native/long_press/LongPressMessageActionSheet.tsx");
        if (typeof module?.default !== "function") throw new Error("Discord's message sheet wasn't found");
        unpatchSheet = instead("default", module, (args: any[], Sheet: Function) => {
            const tree = Reflect.apply(Sheet, undefined, args) as ReactElement;
            try {
                const [{ message, channel }] = args;
                const sheet = findSheet(tree);
                if (sheet && message) {
                    const children = [sheet.props.children].flat().filter(Boolean);
                    children.push(<EndcordActions key="endcord-actions" message={message} channel={channel} />);
                    sheet.props.children = children;
                }
            } catch (e) {
                console.error("[Endcord] couldn't add to the message sheet", e);
            }
            return tree;
        });
    }
    messageActions.set(action.key, action);
    return () => {
        messageActions.delete(action.key);
        if (!messageActions.size) {
            unpatchSheet?.();
            unpatchSheet = null;
        }
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------------------------------

export interface CommandOption {
    name: string;
    description: string;
    type?: "string" | "integer" | "number" | "boolean" | "user" | "channel" | "role";
    required?: boolean;
    /** Values to pick from, shown by Discord as you type */
    choices?: { name: string; value: string | number; }[];
}

const OPTION_TYPES = {
    string: ApplicationCommandOptionType.STRING,
    integer: ApplicationCommandOptionType.INTEGER,
    number: ApplicationCommandOptionType.NUMBER,
    boolean: ApplicationCommandOptionType.BOOLEAN,
    user: ApplicationCommandOptionType.USER,
    channel: ApplicationCommandOptionType.CHANNEL,
    role: ApplicationCommandOptionType.ROLE,
};

export type CommandArgs = Record<string, any>;

/**
 * A slash command. `run` gets the options by name and returns text to send, an object for Discord's sendMessage, or
 * nothing (for commands that answer with botMessage or act on their own).
 */
export function command(def: {
    name: string;
    description: string;
    options?: CommandOption[];
    run: (args: CommandArgs, ctx: CommandContext) => unknown;
}) {
    return registerCommand({
        name: def.name,
        description: t(def.description),
        options: (def.options ?? []).map(o => ({
            name: o.name,
            description: t(o.description),
            type: OPTION_TYPES[o.type ?? "string"],
            required: o.required ?? false,
            choices: o.choices?.map(c => ({ name: c.name, displayName: c.name, value: c.value })),
        })) as any,
        async execute(raw: Argument[], ctx: CommandContext) {
            const args: CommandArgs = {};
            for (const a of raw ?? []) args[a.name] = a.value;
            try {
                const result = await def.run(args, ctx);
                if (typeof result === "string") return { content: result };
                if (result && typeof result === "object") return result as any;
            } catch (e) {
                botMessage(ctx.channel.id, t("Something went wrong: {error}", { error: describeError(e) }));
            }
        },
    });
}

/** How much the plugins have registered here, for leak checks */
export const hookCounts = () => ({
    sendTransforms: transforms.size,
    incomingFilters: incomingFilters.size,
    rowDecorators: decorators.size,
    messageActions: messageActions.size,
});

/** The plugins' registered callbacks themselves, for the self-test to exercise each one */
export const hookRegistries = () => ({ transforms, incomingFilters, decorators, messageActions });
