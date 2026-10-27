/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { addMessageAction, botMessage, command, displayName } from "../hooks";
import { nameOf } from "../shared/people";
import { prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

const friendTags = wrapSync(createStorage<{ users: Record<string, string[]>; }>(createMMKVBackend("ENDCORD_FRIEND_TAGS", { users: {} })));

function FriendTagsPage() {
    useProxy(friendTags);
    const byTag = new Map<string, string[]>();
    for (const [id, tags] of Object.entries(friendTags.users ?? {})) for (const tag of tags) byTag.set(tag, [...byTag.get(tag) ?? [], id]);
    return <LogList
        title={t("Friend Tags")}
        empty={t("Long-press a friend's message and choose Tag Friend")}
        entries={[...byTag.entries()].sort().map(([tag, users]) => ({ key: tag, label: `#${tag}`, subLabel: users.map(nameOf).join(", ") }))}
    />;
}

export default definePlugin({
    id: "endcord.friend-tags",
    name: "FriendTags",
    description: tx("Give friends your own tags and list everyone with a tag with /friendtag"),
    icon: "TagIcon",
    tags: ["Friends"],
    SettingsComponent: FriendTagsPage,
    async start({ cleanup }) {
        await awaitStorage(friendTags);
        cleanup(
            addMessageAction({
                key: "friend-tags",
                icon: "TagIcon",
                label: () => t("Tag Friend"),
                visible: message => !!getStore("RelationshipStore")?.isFriend?.(message.author?.id),
                onPress: message => prompt({
                    title: t("Tags for {user}", { user: displayName(message.author) }),
                    description: t("Separate tags with commas"),
                    initial: (friendTags.users?.[message.author.id] ?? []).join(", "),
                    allowEmpty: true,
                    onSubmit: value => {
                        const tags = [...new Set(value.split(",").map(s => s.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))];
                        const users = { ...(friendTags.users ?? {}) };
                        if (tags.length) users[message.author.id] = tags;
                        else delete users[message.author.id];
                        friendTags.users = users;
                    },
                }),
            }),
            command({
                name: "friendtag",
                description: tx("List the friends with a tag (only you see it)"),
                options: [{ name: "tag", description: tx("The tag"), required: true }],
                run: ({ tag }, ctx) => {
                    const wanted = String(tag).trim().toLowerCase().replace(/^#/, "");
                    const users = Object.entries(friendTags.users ?? {}).filter(([, tags]) => tags.includes(wanted)).map(([id]) => `<@${id}>`);
                    botMessage(ctx.channel.id, users.length ? `#${wanted}: ${users.join(", ")}` : t("No friends have the tag #{tag}.", { tag: wanted }));
                },
            }),
        );
    },
});
