/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's DraftList: every chat where something is still written in the message box, from Discord's DraftStore.
 * PC opens it from the toolbox in the title bar; on a phone it's in Endcord Toolbox and in the plugin's settings.
 * Tapping a chat opens it or discards what's written there.
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";
import { useEdgeInsets } from "@ui/insets";
import { useEffect, useReducer } from "react";
import { ScrollView } from "react-native";

import { definePlugin } from "../api";
import { addToolboxAction, getStore, moduleAt } from "../common";
import { displayName, getChannel, getGuild, getUser, toastError } from "../hooks";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";
import { openPage } from "../ui/pages";
import { Draft, draftPreview, unsentDrafts } from "./drafts";

/** DraftType.ChannelMessage: what's written in a chat's message box */
const messageDraftType = () => moduleAt("stores/DraftStore.tsx")?.DraftType?.ChannelMessage ?? 0;

const draftActions = () => moduleAt("actions/DraftActionCreators.tsx")?.default ?? findByProps("clearDraft", "saveDraft");

function placeOf(channelId: string) {
    const channel = getChannel(channelId);
    if (channel?.guild_id) return { name: `#${channel.name}`, where: getGuild(channel.guild_id)?.name ?? "" };
    if (channel?.name) return { name: channel.name, where: t("Group DM") };
    const userId: string | undefined = channel?.recipients?.[0] ?? channel?.getRecipientId?.();
    const user = getUser(userId);
    const name = user ? getStore("RelationshipStore")?.getNickname?.(user.id) || displayName(user) : t("Unknown user");
    return { name, where: t("Direct Message") };
}

function currentDrafts(): Draft[] {
    const store = getStore("DraftStore");
    return unsentDrafts(store?.getRecentlyEditedDrafts?.(messageDraftType()), id => !!getChannel(id));
}

function openChat(channelId: string) {
    const router = findByProps("transitionToGuild", "transitionTo");
    if (typeof router?.transitionToGuild !== "function") throw new Error(t("Discord's navigation wasn't found"));
    router.transitionToGuild(getChannel(channelId)?.guild_id ?? "@me", channelId);
}

/** Draws again whenever one of these stores changes */
function useStores(names: string[]) {
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        const stores = names.map(name => getStore(name)).filter(store => typeof store?.addChangeListener === "function");
        const listener = () => redraw();
        for (const store of stores) store.addChangeListener(listener);
        return () => {
            for (const store of stores) store.removeChangeListener?.(listener);
        };
    }, []);
}

const when = (ms: number) => ms ? new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

function DraftsList({ onOpen }: { onOpen?: () => void; }) {
    useStores(["DraftStore", "ChannelStore"]);
    const drafts = currentDrafts();
    return <LogList
        title={t("Unsent messages")}
        empty={t("When you leave a chat with something written in its message box, it shows up here.")}
        entries={drafts.map(draft => {
            const { name, where } = placeOf(draft.channelId);
            return {
                key: draft.channelId,
                label: where ? `${name} · ${where}` : name,
                subLabel: [draftPreview(draft.draft), when(draft.timestamp)].filter(Boolean).join("\n"),
                icon: "PencilIcon",
                onPress: () => choose(name, [
                    { label: t("Open chat"), value: "open", icon: "ChatIcon" },
                    { label: t("Discard"), value: "discard", icon: "TrashIcon", danger: true },
                ], action => {
                    try {
                        if (action === "open") {
                            onOpen?.();
                            openChat(draft.channelId);
                        } else {
                            const actions = draftActions();
                            if (typeof actions?.clearDraft !== "function") throw new Error(t("Discord's drafts weren't found"));
                            actions.clearDraft(draft.channelId, messageDraftType());
                        }
                    } catch (e) {
                        toastError(e);
                    }
                }),
            };
        })}
    />;
}

function DraftsPage({ close }: { close: () => void; }) {
    const { bottom } = useEdgeInsets();
    return <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 38 + bottom }}>
        <DraftsList onOpen={close} />
    </ScrollView>;
}

export default definePlugin({
    id: "endcord.draft-list",
    name: "DraftList",
    description: tx("Lists every chat where you left a message unsent, so you can go back and finish it. Open it from Endcord Toolbox or this plugin's settings."),
    icon: "PencilIcon",
    tags: ["Chat", "Utility"],
    SettingsComponent: () => <DraftsList />,
    start({ cleanup }) {
        if (typeof getStore("DraftStore")?.getRecentlyEditedDrafts !== "function") throw new Error(t("Discord's drafts weren't found"));
        cleanup(addToolboxAction("draft-list", {
            label: () => t("Unsent messages"),
            icon: "PencilIcon",
            run: () => openPage(t("Unsent messages"), DraftsPage),
        }));
    },
});
