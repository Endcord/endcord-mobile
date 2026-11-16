/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's MoreStickers, for LINE's sticker and emoji packs: add a pack by its LINE store link in the plugin's
 * settings, then pick its stickers from a button beside the message box. PC uploads the sticker as a picture it
 * redraws (with FFmpeg for animated ones), which a phone app can't do; here a sticker is sent as its picture's link,
 * which Discord shows as the picture (PC's Shift+click). Its pictures load only when you open the picker, one pack at a
 * time. Not ported: packs from a pasted page's HTML or from a file, and PC's search, which looks through sticker IDs.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import safeFetch, { readText } from "@lib/utils/safeFetch";
import { Button, Stack, Text } from "@metro/common/components";
import { useEdgeInsets } from "@ui/insets";
import { useState } from "react";
import { FlatList, Image, Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import { definePlugin } from "../api";
import { addChatButton, getChatInputActionButton } from "../common";
import { currentChannelId, generatedIcon, insertText, send } from "../hooks";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";
import { openPage } from "../ui/pages";
import { isPack, MAX_PAGE, parsePackPage, parsePackUrl, Sticker, StickerPack, storeUrl } from "./line";

const MAX_PACKS = 50;
const TIMEOUT = 20_000;
const COLUMNS = 4;
const GAP = 8;

const storage = wrapSync(createStorage<{ packs: StickerPack[]; }>(createMMKVBackend("ENDCORD_MORE_STICKERS", { packs: [] })));

const packs = () => (Array.isArray(storage.packs) ? storage.packs : []).filter(isPack);

/** Downloads of store pages still going, stopped with the plugin */
const downloads = new Set<AbortController>();

async function downloadPack(link: string): Promise<StickerPack> {
    const target = parsePackUrl(link);
    if (!target) throw new Error(t("That isn't a LINE sticker or emoji pack link"));
    const controller = new AbortController();
    downloads.add(controller);
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
        const res = await safeFetch(storeUrl(target.kind, target.id), { signal: controller.signal }, TIMEOUT);
        return parsePackPage(await readText(res, MAX_PAGE), target.kind, target.id);
    } finally {
        clearTimeout(timer);
        downloads.delete(controller);
    }
}

function addPack() {
    prompt({
        title: t("Add Sticker Pack from URL"),
        description: t("A LINE sticker or emoji pack's store page, like https://store.line.me/stickershop/product/1234/en"),
        placeholder: t("Sticker Pack URL"),
        confirm: t("Add"),
        onSubmit: async link => {
            const pack = await downloadPack(link);
            // The settings page opens while the plugin is off too, before its packs have loaded
            await awaitStorage(storage);
            const others = packs().filter(p => p.id !== pack.id);
            if (others.length >= MAX_PACKS) throw new Error(t("You can keep up to {count} packs", { count: MAX_PACKS }));
            storage.packs = [...others, pack];
            showToast(t("Added {name}", { name: pack.title }), findAssetId("StickerIcon"));
        },
    });
}

function PacksPage() {
    useProxy(storage);
    return <Stack spacing={8}>
        <Button text={t("Add Sticker Pack from URL")} variant="primary" icon={findAssetId("PlusSmallIcon")} onPress={addPack} />
        <LogList
            title={t("Sticker Packs")}
            empty={t("Add a pack from its LINE store link")}
            entries={packs().map(p => ({
                key: p.id,
                label: p.title,
                subLabel: t("{count} stickers", { count: p.stickers.length }),
                icon: "StickerIcon",
                onPress: () => choose(p.title, [{ label: t("Remove"), value: "remove", icon: "TrashIcon", danger: true }], () => {
                    storage.packs = packs().filter(x => x.id !== p.id);
                }),
            }))}
        />
    </Stack>;
}

function StickerTile({ sticker, size, onPick }: { sticker: Sticker; size: number; onPick: (s: Sticker) => void; }) {
    return <Pressable onPress={() => onPick(sticker)} accessibilityRole="button" accessibilityLabel={t("Sticker")} style={{ width: size, height: size }}>
        <Image source={{ uri: sticker.image }} style={{ width: size, height: size }} resizeMode="contain" resizeMethod="resize" />
    </Pressable>;
}

function Picker({ close, onPick }: { close: () => void; onPick: (sticker: Sticker) => void; }) {
    useProxy(storage);
    const list = packs();
    const [selected, setSelected] = useState(list[0]?.id);
    const { width } = useWindowDimensions();
    const insets = useEdgeInsets();
    const size = Math.floor((width - GAP * (COLUMNS + 1)) / COLUMNS);
    const pack = list.find(p => p.id === selected) ?? list[0];

    if (!pack) {
        return <Stack spacing={12} style={{ padding: 16 }}>
            <Text variant="text-md/medium" color="text-muted">{t("Add a pack from its LINE store link")}</Text>
            <Button text={t("Add Sticker Pack from URL")} variant="primary" onPress={addPack} />
        </Stack>;
    }

    return <View style={{ flex: 1 }}>
        {/* Packs by name, so no pack's picture loads until it's opened */}
        <ScrollView horizontal={true} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: GAP, padding: GAP }} showsHorizontalScrollIndicator={false}>
            {list.map(p => <Button key={p.id} size="sm" text={p.title} variant={p.id === pack.id ? "primary" : "secondary"} onPress={() => setSelected(p.id)} />)}
        </ScrollView>
        <FlatList
            key={pack.id}
            data={pack.stickers}
            numColumns={COLUMNS}
            keyExtractor={s => s.id}
            initialNumToRender={COLUMNS * 4}
            windowSize={5}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={{ gap: GAP, padding: GAP, paddingBottom: GAP + insets.bottom }}
            renderItem={({ item }) => <StickerTile sticker={item} size={size} onPick={sticker => {
                close();
                onPick(sticker);
            }} />}
        />
    </View>;
}

export default definePlugin({
    id: "endcord.more-stickers",
    name: "MoreStickers",
    description: tx("Adds sticker packs from other social media platforms. (e.g. LINE)"),
    icon: "StickerIcon",
    tags: ["Chat", "Emotes", "Media"],
    settings: {
        promptToUpload: {
            type: "boolean",
            label: tx("Insert instead of sending"),
            description: tx("Inserts the sticker into your chatbar instead of sending immediately"),
            default: false,
        },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "right",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    SettingsComponent: PacksPage,
    async start({ store, cleanup }) {
        await awaitStorage(storage);
        const pick = (sticker: Sticker) => {
            const channelId = currentChannelId();
            if (!channelId) return void showToast(t("Open a chat first"), findAssetId("CircleXIcon-primary"));
            if (!store.promptToUpload) return void send(channelId, sticker.image);
            if (!insertText(channelId, `${sticker.image} `)) showToast(t("Open a chat first"), findAssetId("CircleXIcon-primary"));
        };
        cleanup(
            () => {
                for (const download of downloads) download.abort();
                downloads.clear();
            },
            addChatButton({
                key: "more-stickers",
                side: () => store.button as "left" | "right" | "none",
                render: () => {
                    const ChatButton = getChatInputActionButton();
                    const Icon = generatedIcon("StickerIcon");
                    if (!ChatButton || !Icon) return null;
                    return <ChatButton accessibilityLabel={t("More Stickers")} IconComponent={Icon} onPress={() => openPage(t("More Stickers"), ({ close }) => <Picker close={close} onPick={pick} />)} />;
                },
            }),
        );
    },
});
