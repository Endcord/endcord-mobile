/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore, subscribe } from "../common";
import { botMessage, command, displayName, getChannel, getUser, localSnowflake, receiveLocalMessage } from "../hooks";
import { preview } from "../shared/messages";
import LogList from "../ui/LogList";

interface Fake {
    id: string;
    authorId: string;
    content: string;
    at: number;
}

const fakes = wrapSync(createStorage<{ channels: Record<string, Fake[]>; }>(createMMKVBackend("ENDCORD_FAKE_DMS", { channels: {} })));

function injectFakes(channelId: string) {
    for (const fake of fakes.channels?.[channelId] ?? []) {
        if (getStore("MessageStore")?.getMessage?.(channelId, fake.id)) continue;
        const user = getUser(fake.authorId);
        receiveLocalMessage(channelId, {
            id: fake.id, channel_id: channelId, content: fake.content, timestamp: new Date(fake.at).toISOString(), edited_timestamp: null,
            type: 0, flags: 0, mentions: [], mention_roles: [], attachments: [], embeds: [], state: "SENT",
            author: { id: fake.authorId, username: user?.username ?? "?", global_name: user?.globalName ?? null, discriminator: "0", avatar: user?.avatar ?? null },
        });
    }
}

function FakeDMPage() {
    useProxy(fakes);
    const all = Object.entries(fakes.channels ?? {}).flatMap(([channelId, list]) => list.map(f => ({ channelId, ...f })));
    return <LogList
        title={t("Fake Messages")}
        empty={t("Use /fakedm in a DM to add one")}
        entries={all.map(f => ({ key: f.id, label: `${displayName(getUser(f.authorId) ?? { id: f.authorId })}: ${preview(f.content)}`, subLabel: new Date(f.at).toLocaleString() }))}
        onClear={() => void (fakes.channels = {})}
    />;
}

export default definePlugin({
    id: "endcord.fake-dm",
    name: "FakeDM",
    description: tx("Injects fake local messages into a DM or group DM with /fakedm. They stay after Discord restarts; only you see them."),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Fun"],
    SettingsComponent: FakeDMPage,
    async start({ cleanup }) {
        await awaitStorage(fakes);
        cleanup(
            subscribe("LOAD_MESSAGES_SUCCESS", ({ channelId }) => {
                if (fakes.channels?.[channelId]?.length) setTimeout(() => injectFakes(channelId), 0);
            }),
            command({
                name: "fakedm",
                description: tx("Add a fake message to this DM that only you see"),
                options: [
                    { name: "user", description: tx("Who it's from"), type: "user", required: true },
                    { name: "message", description: tx("What it says"), required: true },
                ],
                run: ({ user, message }, ctx) => {
                    if (getChannel(ctx.channel.id)?.guild_id) {
                        botMessage(ctx.channel.id, t("This only works in DMs and group DMs."));
                        return;
                    }
                    const fake: Fake = { id: localSnowflake(), authorId: user, content: String(message), at: Date.now() };
                    fakes.channels = { ...(fakes.channels ?? {}), [ctx.channel.id]: [...(fakes.channels?.[ctx.channel.id] ?? []), fake] };
                    injectFakes(ctx.channel.id);
                },
            }),
        );
    },
});
