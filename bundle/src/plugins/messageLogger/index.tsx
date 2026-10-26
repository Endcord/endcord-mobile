/*
 * Endcord for Android
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Deleted and edited messages stay in the chat. The approach (turning a delete into an update and restyling the row
 * Discord generates for it) follows PalmDevs' message-logger for Revenge (GPL-3.0).
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByName } from "@metro";
import { tokens } from "@metro/common";
import { Button } from "@metro/common/components";
import { processColor } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, dispatchSoon, getStore, onAction } from "../common";

interface MessageRecord {
    id: string;
    channel_id: string;
    content: string;
    state: string;
    flags: number;
    author: { id: string; bot?: boolean; };
    mentions?: Array<{ id: string; } | string>;
    mentionEveryone?: boolean;
    mention_everyone?: boolean;
}

interface Log {
    channelId: string;
    guildId?: string;
    deleted: boolean;
    /** Earlier versions, oldest first */
    edits: MessageRecord[];
}

const EPHEMERAL = 1 << 6;
const MESSAGE_ROW = 1;
const ROW_CHANGED = 2;
const MAX_LOGS = 1000;
const MAX_EDITS = 25;

const logs = new Map<string, Log>();
/** Rows to send to native again although Discord sees the same record */
const changed = new Set<string>();
/** Messages whose actions go through untouched, while their log is removed */
const bypassed = new Set<string>();

const plugin = definePlugin({
    id: "endcord.message-logger",
    name: "MessageLogger",
    description: tx("Keeps deleted messages in the chat and shows earlier versions of edited ones."),
    authors: [ENDCORD_AUTHOR],
    popular: 2,
    icon: "TrashIcon",
    settings: {
        logDeletes: { type: "boolean", label: tx("Log deleted messages"), default: true },
        logEdits: { type: "boolean", label: tx("Log edited messages"), default: true },
        ignoreBots: { type: "boolean", label: tx("Ignore bots"), description: tx("Don't log messages from bots"), default: false },
        ignoreSelf: { type: "boolean", label: tx("Ignore yourself"), description: tx("Don't log your own messages"), default: false },
        ghostPings: {
            type: "boolean",
            label: tx("Ghost ping alerts"),
            description: tx("Show a notice when someone deletes a message that mentioned you"),
            default: true,
        },
        ignoredUsers: {
            type: "string",
            label: tx("Ignored users"),
            description: tx("User IDs whose messages aren't logged, separated by commas"),
            placeholder: tx("e.g. 123456789012345678, 234567890123456789"),
            default: "",
        },
        ignoredChannels: {
            type: "string",
            label: tx("Ignored channels and servers"),
            description: tx("Channel or server IDs where nothing is logged, separated by commas"),
            placeholder: tx("e.g. 123456789012345678"),
            default: "",
        },
    },
    start({ store, cleanup }) {
        const RowManager = findByName("RowManager");
        if (typeof RowManager?.prototype?.generate !== "function") throw new Error("Discord's message rows weren't found");

        cleanup(
            onAction<{ id: string; channelId: string; guildId?: string; }>("MESSAGE_DELETE", payload => {
                if (!store.logDeletes || !keepDeleted(payload.channelId, payload.id, payload.guildId)) return;
                // Turned into an update, so Discord keeps the message and redraws it
                return { type: "MESSAGE_UPDATE", message: { id: payload.id, channel_id: payload.channelId }, guildId: payload.guildId };
            }),
            onAction<{ ids: string[]; channelId: string; guildId?: string; }>("MESSAGE_DELETE_BULK", payload => {
                if (!store.logDeletes) return;
                const kept = new Set(payload.ids.filter(id => keepDeleted(payload.channelId, id, payload.guildId, true)));
                if (!kept.size) return;
                for (const id of kept) dispatchSoon(redraw(payload.channelId, id, payload.guildId));
                const rest = payload.ids.filter(id => !kept.has(id));
                return rest.length ? { ids: rest } : false;
            }),
            onAction<{ message?: { id: string; channel_id: string; content?: string; }; guildId?: string; }>("MESSAGE_UPDATE", payload => {
                const update = payload.message;
                if (!store.logEdits || !update?.id || bypassed.has(update.id)) return;
                const record = getMessage(update.channel_id, update.id);
                if (!record || !shouldLog(record, payload.guildId)) return;
                if (record.content && update.content !== undefined && update.content !== record.content) {
                    const log = logOf(record, payload.guildId);
                    log.edits.push(record);
                    if (log.edits.length > MAX_EDITS) log.edits.shift();
                }
            }),
            instead("generate", RowManager.prototype, function (this: any, args: any[], original: Function) {
                const row = original.apply(this, args);
                try {
                    styleRow(row, args[0], (a: any) => original.call(this, a));
                } catch (e) {
                    console.error("[Endcord] MessageLogger couldn't style a message", e);
                }
                return row;
            }),
            () => {
                const toRestore = [...logs.entries()];
                logs.clear();
                changed.clear();
                // Messages deleted while logged are really removed now
                for (const [id, log] of toRestore) if (log.deleted) dispatchSoon({ type: "MESSAGE_DELETE", id, channelId: log.channelId, guildId: log.guildId });
            },
        );
    },
    SettingsComponent: () => <Button
        text={t("Clear logged messages")}
        variant="secondary"
        size="md"
        icon={findAssetId("TrashIcon")}
        onPress={() => {
            clearLogs();
            showToast(t("Logged messages cleared"), findAssetId("CheckmarkLargeIcon"));
        }}
    />,
});

const getMessage = (channelId: string, id: string): MessageRecord | undefined => getStore("MessageStore")?.getMessage?.(channelId, id);

const idList = (value: string) => value.split(/[\s,]+/).filter(Boolean);

function shouldLog(record: MessageRecord, guildId?: string) {
    const { store } = plugin;
    if (store.ignoreBots && record.author?.bot) return false;
    if (store.ignoreSelf && record.author?.id === currentUserId()) return false;
    if (idList(store.ignoredUsers).includes(record.author?.id)) return false;
    const places = idList(store.ignoredChannels);
    if (places.length) {
        const channel = getStore("ChannelStore")?.getChannel?.(record.channel_id);
        if (places.includes(record.channel_id) || (channel?.parent_id && places.includes(channel.parent_id))) return false;
        if (places.includes(guildId ?? channel?.guild_id)) return false;
    }
    return true;
}

function logOf(record: MessageRecord, guildId?: string) {
    let log = logs.get(record.id);
    if (!log) {
        log = { channelId: record.channel_id, guildId, deleted: false, edits: [] };
        logs.set(record.id, log);
        // The oldest log goes first; its message is really deleted if it was
        if (logs.size > MAX_LOGS) {
            const [oldestId, oldest] = logs.entries().next().value!;
            logs.delete(oldestId);
            if (oldest.deleted) dispatchSoon({ type: "MESSAGE_DELETE", id: oldestId, channelId: oldest.channelId, guildId: oldest.guildId });
        }
    }
    return log;
}

function keepDeleted(channelId: string, id: string, guildId?: string, bulk = false) {
    if (bypassed.has(id)) return false;
    const record = getMessage(channelId, id);
    if (!record) return false;
    // Your own deletes are dispatched again once the server confirms them
    if (logs.get(id)?.deleted) return true;
    // Unsent and ephemeral messages are dismissed, not deleted
    if (record.state !== "SENT" || record.flags & EPHEMERAL) return false;
    if (!shouldLog(record, guildId)) return false;

    logOf(record, guildId).deleted = true;
    changed.add(id);
    if (!bulk) alertGhostPing(record);
    return true;
}

function alertGhostPing(record: MessageRecord) {
    if (!plugin.store.ghostPings) return;
    const me = currentUserId();
    if (!me || record.author?.id === me) return;
    const mentioned = record.mentions?.some(m => (typeof m === "string" ? m : m?.id) === me)
        || record.mentionEveryone || record.mention_everyone;
    if (!mentioned) return;
    const author = getStore("UserStore")?.getUser?.(record.author.id);
    showToast(t("{user} mentioned you and deleted the message", { user: author?.globalName ?? author?.username ?? record.author.id }), findAssetId("AtIcon"));
}

const redraw = (channelId: string, id: string, guildId?: string) => ({ type: "MESSAGE_UPDATE", guildId, message: { id, channel_id: channelId } });

export function clearLogs() {
    for (const [id, log] of [...logs.entries()]) {
        logs.delete(id);
        changed.add(id);
        bypassed.add(id);
        dispatchSoon(log.deleted
            ? { type: "MESSAGE_DELETE", id, channelId: log.channelId, guildId: log.guildId }
            : redraw(log.channelId, id, log.guildId));
        setTimeout(() => bypassed.delete(id), 50);
    }
}

let criticalColor: number | undefined;
function deletedColor() {
    if (criticalColor !== undefined) return criticalColor;
    try {
        const theme = getStore("ThemeStore")?.theme;
        const resolved = tokens.internal?.resolveSemanticColor?.(theme, tokens.colors.TEXT_FEEDBACK_CRITICAL ?? tokens.colors.TEXT_DANGER);
        criticalColor = processColor(resolved ?? "#F23F43") as number;
    } catch {
        criticalColor = processColor("#F23F43") as number;
    }
    return criticalColor;
}

const text = (content: string) => ({ type: "text", content });

function styleRow(row: any, args: { message: MessageRecord; }, generate: (args: any) => any) {
    const message = row?.type === MESSAGE_ROW ? row.message : undefined;
    if (!message) return;

    // Discord sees the same record, so it wouldn't send the row to native again on its own
    if (changed.delete(message.id)) row.changeType = ROW_CHANGED;

    const log = logs.get(message.id);
    if (!log) return;

    if (log.edits.length && Array.isArray(message.content)) {
        const history = log.edits.flatMap(record => {
            const old = generate({ ...args, message: record })?.message?.content ?? [text(record.content)];
            return [...old, text(` (${t("edited")})\n`)];
        });
        message.content = [...history, ...message.content];
    }

    if (log.deleted) {
        criticalColor = undefined;
        const color = deletedColor();
        message.textColor = color;
        message.timestampColor = color;
        // Shown where Discord puts "(edited)"
        message.edited = t("deleted");
        message.editedColor = color;
    }
}

export default plugin;
