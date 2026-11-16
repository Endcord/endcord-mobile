/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ID Translater: bare Discord IDs in messages show as the mention, channel reference or message link they
 * stand for, which can be tapped. Like PC, only what is shown changes: the message itself, and what copying it gives,
 * stay as they were sent. PC hands Discord's message parser the translated text; on the phone the chat's rows are
 * built from the message's record, so here the row is built from a copy of the record with the translated text, by
 * Discord's own code, as MessageLogger builds the rows of a message's earlier versions. Code in a message is left as
 * it is written.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";
import { findByName } from "@metro";

import { definePlugin, onSettingChange } from "../api";
import { currentUserId, getStore, guildRoles } from "../common";
import { getChannel, messageLink, onMessageRow, redrawChannel } from "../hooks";
import { MAX_ID_LENGTH, MIN_ID_LENGTH, translateIds } from "./translate";

const MESSAGE_ROW = 1;

/** A copy of Discord's record of a message with other text, by the record's own means when it has them */
function withContent(record: any, content: string) {
    if (typeof record.set === "function") {
        const changed = record.set("content", content);
        if (changed && changed !== record && changed.content === content) return changed;
    }
    return Object.assign(Object.create(Object.getPrototypeOf(record)), record, { content });
}

const plugin = definePlugin({
    id: "endcord.id-translater",
    name: "ID Translater",
    description: tx("Automatically translates Discord IDs to clickable @ mentions or # references"),
    icon: "IdIcon",
    tags: ["Chat", "Utility"],
    settings: {
        translateUserIds: { type: "boolean", label: tx("User IDs"), description: tx("Convert user IDs to clickable @ mentions"), default: true },
        translateChannelIds: { type: "boolean", label: tx("Channel IDs"), description: tx("Convert channel IDs to clickable # references"), default: true },
        translateRoleIds: { type: "boolean", label: tx("Role IDs"), description: tx("Convert role IDs to clickable @& mentions"), default: true },
        translateMessageIds: { type: "boolean", label: tx("Message IDs"), description: tx("Convert message IDs to clickable links"), default: false },
        translateOwnMessages: { type: "boolean", label: tx("Your own messages"), description: tx("Translate IDs in your own sent messages"), default: false },
        minIdLength: { type: "number", label: tx("Shortest ID"), description: tx("Minimum ID length to convert (Discord: 17-19 digits)"), default: 17, min: MIN_ID_LENGTH, max: MAX_ID_LENGTH },
        maxIdLength: { type: "number", label: tx("Longest ID"), description: tx("Maximum ID length to convert"), default: 19, min: MIN_ID_LENGTH, max: MAX_ID_LENGTH },
    },
    start({ store, cleanup, logger }) {
        const RowManager = findByName("RowManager");
        if (typeof RowManager?.prototype?.generate !== "function") throw new Error("Discord's message rows weren't found");

        /**
         * The translated copy of each record, made again when its text or the settings change. The same copy is given
         * each time, so what the chat builds from it doesn't change for nothing
         */
        const copies = new WeakMap<object, { key: string; record: any; }>();
        /** Records whose translated copy Discord couldn't build a row from: drawn as they were sent from then on */
        const failed = new WeakSet<object>();

        const translated = (record: any) => {
            if (failed.has(record)) return record;
            const { content } = record;
            const own = record.author?.id === currentUserId();
            if (own && !store.translateOwnMessages) return record;
            const key = `${content}\n${JSON.stringify([store.translateUserIds, store.translateChannelIds, store.translateRoleIds, store.translateMessageIds, store.minIdLength, store.maxIdLength])}`;
            const cached = copies.get(record);
            if (cached?.key === key) return cached.record;
            const guildId: string | undefined = getChannel(record.channel_id)?.guild_id;
            const text = translateIds(content, {
                users: store.translateUserIds,
                channels: store.translateChannelIds,
                roles: store.translateRoleIds,
                messages: store.translateMessageIds,
                minLength: store.minIdLength,
                maxLength: store.maxIdLength,
            }, {
                isUser: id => !!getStore("UserStore")?.getUser?.(id),
                isChannel: id => !!getChannel(id),
                isRole: id => !!guildId && !!guildRoles(guildId)[id],
                messageLink: id => messageLink(record.channel_id, id),
            });
            if (text === content) return record;
            // Only a translation is kept: an ID that isn't anyone Discord knows yet may be later
            const copy = withContent(record, text);
            copies.set(record, { key, record: copy });
            return copy;
        };

        cleanup(
            instead("generate", RowManager.prototype, function (this: any, args: any[], original: Function) {
                const options = args[0];
                const record = options?.message;
                if (!record || typeof record.content !== "string" || typeof options.rowType === "number" && options.rowType !== MESSAGE_ROW) {
                    return original.apply(this, args);
                }
                let copy = record;
                try {
                    copy = translated(record);
                } catch (e) {
                    logger.error("couldn't translate a message", e);
                }
                if (copy === record) return original.apply(this, args);
                try {
                    return original.call(this, { ...options, message: copy }, ...args.slice(1));
                } catch (e) {
                    // The message is drawn as it was sent rather than not at all, and isn't translated again
                    failed.add(record);
                    copies.delete(record);
                    logger.error("Discord couldn't draw a message with its IDs translated, so it's drawn as it was sent", e);
                    return original.apply(this, args);
                }
            }),
            // Draws the open chat again when the plugin starts and stops, through the shared row patch
            onMessageRow("id-translater", () => { }),
            onSettingChange(store, () => redrawChannel()),
        );
    },
});

export default plugin;
