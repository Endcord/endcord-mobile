/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Adapted from Endcord PC's ShowHiddenChannels, which puts the channels you can't open into the channel list with a
 * lock and, when you open one, shows what can still be seen of it instead of its messages. Discord's phone app builds
 * its channel list from what it believes you may see, and making it believe otherwise would also make it fetch and
 * subscribe to those channels. So here they're listed on a page of their own, by category and with a lock, opened with
 * /hiddenchannels or from EndcordToolbox; tapping one shows what PC's lock screen shows: its topic or guidelines, its
 * settings, its tags, and which roles and members can see it. Only what Discord already sent the app is read: nothing
 * is fetched but the names of members let in by an overwrite of their own, as PC does.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { FluxUtils } from "@metro/common";
import { Stack, TableRow, TableRowGroup, Text } from "@metro/common/components";
import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { definePlugin } from "../api";
import { addToolboxAction, dispatchSoon, getStore, guildRoles } from "../common";
import { botMessage, command, currentChannelId, displayName, getChannel, getGuild, getUser, snowflakeTime } from "../hooks";
import { showText } from "../ui/dialogs";
import { openPage } from "../ui/pages";
import { type Access, ChannelType, clip, durationParts, groupByCategory, isThreadType, permissionNames, toBits, whoCanSee } from "./access";

/** Forum and media channels whose posts need a tag */
const REQUIRE_TAG = 1 << 4;
/** The most members asked for at once when opening a channel: those with an overwrite of their own */
const MAX_MEMBER_REQUEST = 100;

const plugin = definePlugin({
    id: "endcord.show-hidden-channels",
    name: "ShowHiddenChannels",
    description: tx("See the channels of a server you can't open, with a lock, and what's visible about each: its topic, settings and who can see it. Open the list with /hiddenchannels or from EndcordToolbox."),
    icon: "LockIcon",
    tags: ["Servers", "Utility"],
    settings: {
        defaultAllowedUsersAndRolesDropdownState: {
            type: "boolean",
            label: tx("Whether the allowed users and roles dropdown on hidden channels should be open by default"),
            default: true,
        },
    },
    start({ cleanup }) {
        if (typeof getStore("PermissionStore")?.can !== "function" || typeof getStore("ChannelStore")?.getMutableGuildChannelsForGuild !== "function") {
            throw new Error("Discord's channel permissions weren't found");
        }
        if (permissionTable()?.VIEW_CHANNEL == null) throw new Error("Discord's permission table wasn't found");

        cleanup(
            command({
                name: "hiddenchannels",
                description: tx("See this server's channels you can't open"),
                run: (_, ctx) => {
                    const guildId = ctx.channel.guild_id;
                    if (!guildId) return botMessage(ctx.channel.id, t("Use it in a server."));
                    openHiddenChannels(guildId);
                },
            }),
            addToolboxAction("show-hidden-channels", {
                label: () => t("Hidden channels"),
                icon: "LockIcon",
                run: () => {
                    const guildId = getStore("SelectedGuildStore")?.getGuildId?.() ?? getChannel(currentChannelId())?.guild_id;
                    if (!guildId) return showToast(t("Open a server first"), findAssetId("LockIcon"));
                    openHiddenChannels(guildId);
                },
            }),
        );
    },
});

export default plugin;

const permissionTable = (): Record<string, unknown> | undefined => findByProps("Permissions", "ChannelTypes")?.Permissions;

function canView(channel: any): boolean {
    const flag = permissionTable()?.VIEW_CHANNEL;
    try {
        return !!getStore("PermissionStore")?.can?.(flag, channel);
    } catch {
        // Listed as visible: a channel is only shown as hidden when Discord says so
        return true;
    }
}

/** The server's channels you can't see, by category; categories themselves and threads aren't listed */
function hiddenChannels(guildId: string) {
    const all = Object.values<any>(getStore("ChannelStore")?.getMutableGuildChannelsForGuild?.(guildId) ?? {})
        .filter(c => c && typeof c.id === "string" && typeof c.type === "number");
    const categories: Record<string, any> = Object.create(null);
    for (const channel of all) if (channel.type === ChannelType.CATEGORY) categories[channel.id] = channel;
    const hidden = all.filter(c => c.type !== ChannelType.CATEGORY && !isThreadType(c.type) && !canView(c));
    return groupByCategory(hidden, categories);
}

function openHiddenChannels(guildId: string) {
    const name = clip(getGuild(guildId)?.name, 60) || t("Hidden channels");
    openPage(name, () => <HiddenChannelsPage guildId={guildId} />);
}

function openChannel(channelId: string) {
    openPage(channelTitle(getChannel(channelId)), () => <HiddenChannelPage channelId={channelId} />);
}

const TYPE_LABELS: Record<number, string> = {
    [ChannelType.TEXT]: tx("Text channel"),
    [ChannelType.VOICE]: tx("Voice channel"),
    [ChannelType.CATEGORY]: tx("Category"),
    [ChannelType.ANNOUNCEMENT]: tx("Announcement channel"),
    [ChannelType.STAGE]: tx("Stage channel"),
    [ChannelType.DIRECTORY]: tx("Directory channel"),
    [ChannelType.FORUM]: tx("Forum channel"),
    [ChannelType.MEDIA]: tx("Media channel"),
};

const typeLabel = (type: number) => t(TYPE_LABELS[type] ?? tx("Channel"));

const isVocal = (channel: any) => channel?.type === ChannelType.VOICE || channel?.type === ChannelType.STAGE;
const isForum = (channel: any) => channel?.type === ChannelType.FORUM || channel?.type === ChannelType.MEDIA;

/** The channel's name as the channel list shows it; a name Discord left out is said to be hidden */
function channelTitle(channel: any): string {
    const name = clip(channel?.name, 100);
    if (!name) return t("Name hidden by Discord");
    return isVocal(channel) || channel?.type === ChannelType.CATEGORY ? name : `#${name}`;
}

function duration(seconds: number): string {
    const words: Record<string, (count: number) => string> = {
        day: count => count === 1 ? t("1 day") : t("{count} days", { count }),
        hour: count => count === 1 ? t("1 hour") : t("{count} hours", { count }),
        minute: count => count === 1 ? t("1 minute") : t("{count} minutes", { count }),
        second: count => count === 1 ? t("1 second") : t("{count} seconds", { count }),
    };
    return durationParts(seconds).map(([count, unit]) => words[unit](count)).join(" ");
}

function formatTime(ms: number): string | undefined {
    if (!Number.isFinite(ms) || ms <= 0) return undefined;
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return new Date(ms).toISOString();
    }
}

function HiddenChannelsPage({ guildId }: { guildId: string; }) {
    const groups = hiddenChannels(guildId);
    const count = groups.reduce((n, group) => n + group.channels.length, 0);
    const server = clip(getGuild(guildId)?.name, 100) || guildId;

    return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Stack spacing={16}>
            <Text variant="text-md/medium" color="text-muted">
                {count === 0
                    ? t("You can see every channel in {server}.", { server })
                    : count === 1
                        ? t("1 channel in {server} is hidden from you. Tap it to see what's visible about it.", { server })
                        : t("{count} channels in {server} are hidden from you. Tap one to see what's visible about it.", { count, server })}
            </Text>
            {groups.map(group => <TableRowGroup key={group.category?.id ?? "none"} title={group.category ? channelTitle(group.category) : t("No category")}>
                {group.channels.map(channel => {
                    const topic = clip(typeof channel.topic === "string" ? channel.topic.replace(/\s+/g, " ") : "", 80);
                    return <TableRow
                        key={channel.id}
                        label={channelTitle(channel)}
                        subLabel={topic ? `${typeLabel(channel.type)} · ${topic}` : typeLabel(channel.type)}
                        icon={<TableRow.Icon source={findAssetId("LockIcon")!} />}
                        arrow={true}
                        onPress={() => openChannel(channel.id)}
                    />;
                })}
            </TableRowGroup>)}
        </Stack>
    </ScrollView>;
}

/** What the channel's settings say, as rows of a label and a value */
function details(channel: any): Array<[string, string]> {
    const rows: Array<[string, string | undefined]> = [];
    const forum = isForum(channel);
    const vocal = isVocal(channel);
    rows.push([t("Channel type"), typeLabel(channel.type)]);
    if (channel.nsfw === true) rows.push([t("Age-restricted"), t("Yes")]);
    if (typeof channel.lastMessageId === "string" && /^\d{1,20}$/.test(channel.lastMessageId)) {
        rows.push([forum ? t("Last post") : t("Last message"), formatTime(snowflakeTime(channel.lastMessageId))]);
    }
    if (channel.lastPinTimestamp) rows.push([t("Last pinned message"), formatTime(Date.parse(String(channel.lastPinTimestamp)))]);
    if (channel.rateLimitPerUser > 0) rows.push([t("Slowmode"), duration(channel.rateLimitPerUser)]);
    if (channel.defaultThreadRateLimitPerUser > 0) rows.push([t("Default thread slowmode"), duration(channel.defaultThreadRateLimitPerUser)]);
    if (vocal && typeof channel.bitrate === "number") rows.push([t("Bitrate"), t("{kbps} kbps", { kbps: Math.round(channel.bitrate / 1000) })]);
    if (vocal && channel.userLimit > 0) rows.push([t("User limit"), String(channel.userLimit)]);
    if (vocal && channel.rtcRegion !== undefined) rows.push([t("Region"), clip(channel.rtcRegion, 40) || t("Automatic")]);
    if (vocal) rows.push([t("Video quality"), channel.videoQualityMode === 2 ? "720p" : t("Automatic")]);
    if (channel.defaultAutoArchiveDuration > 0) {
        rows.push([forum ? t("Posts hide after no activity for") : t("Threads hide after no activity for"), duration(channel.defaultAutoArchiveDuration * 60)]);
    }
    if (forum && channel.defaultForumLayout != null) {
        const layouts: Record<number, string> = { 0: t("Not set"), 1: t("List view"), 2: t("Gallery view") };
        rows.push([t("Default layout"), layouts[channel.defaultForumLayout]]);
    }
    if (forum && channel.defaultSortOrder != null) {
        const orders: Record<number, string> = { 0: t("Latest activity"), 1: t("Creation date") };
        rows.push([t("Default sort order"), orders[channel.defaultSortOrder]]);
    }
    const emoji = channel.defaultReactionEmoji;
    if (emoji?.emojiName || emoji?.emojiId) {
        const custom = emoji.emojiId ? getStore("EmojiStore")?.getCustomEmojiById?.(emoji.emojiId)?.name : undefined;
        rows.push([t("Default reaction"), clip(emoji.emojiName, 20) || (custom ? `:${clip(custom, 40)}:` : t("A custom emoji"))]);
    }
    if (forum && typeof channel.flags === "number" && channel.flags & REQUIRE_TAG) rows.push([t("Tags"), t("Posts need a tag")]);
    rows.push([t("Created on"), formatTime(snowflakeTime(channel.id))]);
    return rows.filter((row): row is [string, string] => !!row[1]);
}

function memberName(guildId: string, userId: string): string | undefined {
    const nick = getStore("GuildMemberStore")?.getMember?.(guildId, userId)?.nick;
    if (typeof nick === "string" && nick) return clip(nick, 40);
    const user = getUser(userId);
    return user ? clip(displayName(user), 40) : undefined;
}

const titleCase = (name: string) => name.toLowerCase().split("_").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");

/** Each permission overwrite of the channel: whose, and what it allows and denies */
function overwriteDetails(channel: any): string {
    const table = permissionTable() ?? {};
    const roles = guildRoles(channel.guild_id);
    const lines: string[] = [];
    for (const overwrite of Object.values<any>(channel.permissionOverwrites ?? {})) {
        if (!overwrite || typeof overwrite.id !== "string") continue;
        const member = overwrite.type === 1 || overwrite.type === "member";
        const who = overwrite.id === channel.guild_id
            ? "@everyone"
            : member
                ? memberName(channel.guild_id, overwrite.id) ?? t("Member {id}", { id: overwrite.id })
                : `@${clip(roles[overwrite.id]?.name, 60) || overwrite.id}`;
        const allowed = permissionNames(toBits(overwrite.allow), table).map(titleCase);
        const denied = permissionNames(toBits(overwrite.deny), table).map(titleCase);
        lines.push([
            who,
            allowed.length ? `  ✅ ${allowed.join(", ")}` : "",
            denied.length ? `  ⛔ ${denied.join(", ")}` : "",
        ].filter(Boolean).join("\n"));
    }
    return lines.join("\n\n") || t("This channel has no permission overwrites.");
}

function HiddenChannelPage({ channelId }: { channelId: string; }) {
    const [open, setOpen] = useState(!!plugin.store.defaultAllowedUsersAndRolesDropdownState);
    const channel = getChannel(channelId);
    const guildId: string = channel?.guild_id ?? "";
    const guild = getGuild(guildId);

    let access: Access | undefined;
    if (channel && guildId) {
        const table = permissionTable() ?? {};
        access = whoCanSee({
            guildId,
            ownerId: typeof guild?.ownerId === "string" ? guild.ownerId : undefined,
            roles: guildRoles(guildId),
            overwrites: channel.permissionOverwrites,
            viewFlag: toBits(table.VIEW_CHANNEL),
            adminFlag: toBits(table.ADMINISTRATOR),
        });
    }
    const userIds = access?.userIds ?? [];

    // Drawn again as the members asked for below arrive
    const memberStores = ["GuildMemberStore", "UserStore"].map(name => getStore(name)).filter(Boolean);
    const names: string = FluxUtils.useStateFromStores(memberStores, () => userIds.map(id => memberName(guildId, id) ?? "").join("\u0000"), [channelId, userIds.join(",")]);

    useEffect(() => {
        if (!guildId) return;
        const missing = userIds.filter(id => !getStore("GuildMemberStore")?.getMember?.(guildId, id)).slice(0, MAX_MEMBER_REQUEST);
        if (missing.length) dispatchSoon({ type: "GUILD_MEMBERS_REQUEST", guildIds: [guildId], userIds: missing });
    }, [channelId]);

    if (!channel || !guildId) {
        return <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text variant="text-md/medium" color="text-muted">{t("This channel no longer exists.")}</Text>
        </ScrollView>;
    }

    const forum = isForum(channel);
    const topic = clip(channel.topic, 4096);
    const tags: any[] = Array.isArray(channel.availableTags) ? channel.availableTags.slice(0, 50) : [];
    const shownNames = names.split("\u0000");
    const ownerId = guild?.ownerId;

    return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Stack spacing={16}>
            <Text variant="text-md/medium" color="text-muted">
                {isVocal(channel)
                    ? t("This channel is hidden from you, so you can't join it or see who's in it.")
                    : forum
                        ? t("This channel is hidden from you, so you can't see its posts.")
                        : t("This channel is hidden from you, so you can't see its messages.")}
            </Text>
            {!!topic && <TableRowGroup title={forum ? t("Guidelines") : t("Topic")}>
                <TableRow label={<Text variant="text-md/normal" color="text-default" selectable={true}>{topic}</Text>} />
            </TableRowGroup>}
            <TableRowGroup title={t("About this channel")}>
                {details(channel).map(([label, value], i) => <TableRow key={i} label={label} subLabel={value} />)}
            </TableRowGroup>
            {tags.length > 0 && <TableRowGroup title={t("Available tags")}>
                {tags.map((tag, i) => <TableRow
                    key={typeof tag?.id === "string" ? tag.id : i}
                    label={`${clip(tag?.emojiName, 20)} ${clip(tag?.name, 40)}`.trim() || t("Tag")}
                    subLabel={tag?.moderated ? t("Only moderators can use it") : undefined}
                />)}
            </TableRowGroup>}
            <TableRowGroup title={t("Allowed users and roles")}>
                <TableRow
                    label={open ? t("Hide allowed users and roles") : t("View allowed users and roles")}
                    arrow={true}
                    onPress={() => {
                        setOpen(!open);
                        plugin.store.defaultAllowedUsersAndRolesDropdownState = !open;
                    }}
                />
                {open && access?.everyone && <TableRow label="@everyone" subLabel={t("Everyone in the server can see it; an overwrite keeps you out")} />}
                {open && access?.roles.slice(0, 100).map(role => <TableRow
                    key={role.id}
                    label={`@${clip(role.name, 60)}`}
                    subLabel={role.admin ? t("Administrator") : undefined}
                />)}
                {open && userIds.slice(0, 100).map((id, i) => <TableRow
                    key={id}
                    label={shownNames[i] || t("Member {id}", { id })}
                    subLabel={id === ownerId ? t("Server owner") : undefined}
                />)}
                {open && !access?.everyone && !access?.roles.length && userIds.length <= 1 && <TableRow label={t("Only the server's owner can see it")} />}
                <TableRow label={t("Permission details")} arrow={true} onPress={() => showText(channelTitle(channel), overwriteDetails(channel))} />
            </TableRowGroup>
        </Stack>
    </ScrollView>;
}
