/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's CharacterCounter: how long the message you're writing is, out of the most you can send, next to the
 * emoji button in the message box. PC also counts the selected text and hides Discord's Nitro tooltip about message
 * length; the phone's message box doesn't share its selection, and has no such tooltip.
 */

import { t, tx } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { Text } from "@metro/common/components";
import { useEffect, useReducer } from "react";
import { View } from "react-native";

import { definePlugin } from "../api";
import { addChatButton, getStore } from "../common";
import { counterLevel, LEVEL_COLORS, messageLimit } from "./count";

/** The DraftStore draft of the message box: DraftType.ChannelMessage */
const MESSAGE_DRAFT = 0;

/** Draws again when the text, the open chat or your Nitro changes */
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

const plugin = definePlugin({
    id: "endcord.character-counter",
    name: "CharacterCounter",
    description: tx("Adds a character counter to the chat input"),
    icon: "TextIcon",
    tags: ["Utility"],
    settings: {
        colorEffects: { type: "boolean", label: tx("Enable yellow/red colouring as you get closer to the character limit"), default: true },
    },
    start({ cleanup }) {
        if (typeof getStore("DraftStore")?.getDraft !== "function") throw new Error(t("Discord's drafts weren't found"));
        cleanup(addChatButton({ key: "character-counter", side: () => "right", render: Counter }));
    },
});

function Counter() {
    useStores(["DraftStore", "SelectedChannelStore", "UserStore"]);
    const { colorEffects } = useProxy(plugin.store);
    const channelId: string | undefined = getStore("SelectedChannelStore")?.getChannelId?.();
    const draft = channelId ? getStore("DraftStore")?.getDraft?.(channelId, MESSAGE_DRAFT) : undefined;
    const length = typeof draft === "string" ? draft.length : 0;
    if (!length) return null;
    const max = messageLimit(getStore("UserStore")?.getCurrentUser?.()?.premiumType);
    const level = colorEffects ? counterLevel(length, max) : "normal";
    return <View style={{ justifyContent: "center", paddingHorizontal: 4 }} accessible={true} accessibilityLabel={`${length}/${max}`}>
        <Text variant="text-xs/semibold" color="text-muted" style={level === "normal" ? undefined : { color: LEVEL_COLORS[level] }}>
            {`${length}/${max}`}
        </Text>
    </View>;
}

export default plugin;
