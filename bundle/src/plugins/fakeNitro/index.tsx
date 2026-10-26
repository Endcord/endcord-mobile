/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Emojis and stickers you can't use are sent as links. Ported from the fake-nitro plugin of the Revenge community
 * plugins (GPL-3.0), which tracks the current Discord app.
 */

import { t, tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";
import { openAlert } from "@lib/ui/alerts";
import { findByProps } from "@metro";
import { AlertActionButton, AlertActions, AlertModal } from "@metro/common/components";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { getStore, moduleAt } from "../common";

interface Emoji { id: string; name: string; animated?: boolean; }
interface Sticker { id: string; name: string; format_type: number; available?: boolean; guild_id?: string; pack_id?: string; }
interface MessageData { content: string; invalidEmojis?: Emoji[]; validNonShortcutEmojis?: Emoji[]; }

const EMBED_LINKS = 1n << 14n;
const USE_EXTERNAL_STICKERS = 1n << 37n;

const plugin = definePlugin({
    id: "endcord.fake-nitro",
    name: "FakeNitro",
    description: tx("Use any emoji and sticker without Nitro: the ones you can't use are sent as links."),
    authors: [ENDCORD_AUTHOR],
    popular: 4,
    icon: "NitroWheelIcon",
    tags: ["Emotes", "Appearance", "Customisation", "Chat"],
    settings: {
        emojis: { type: "boolean", label: tx("Emojis"), description: tx("Send emojis you can't use as links"), default: true },
        stickers: { type: "boolean", label: tx("Stickers"), description: tx("Send stickers you can't use as links"), default: true },
        emojiSize: {
            type: "select",
            label: tx("Emoji size"),
            default: "48",
            options: [
                { label: "32 px", value: "32" },
                { label: "48 px", value: "48" },
                { label: "64 px", value: "64" },
                { label: "96 px", value: "96" },
                { label: "128 px", value: "128" },
            ],
        },
        stickerSize: {
            type: "select",
            label: tx("Sticker size"),
            default: "160",
            options: [
                { label: "128 px", value: "128" },
                { label: "160 px", value: "160" },
                { label: "320 px", value: "320" },
            ],
        },
        hyperlink: {
            type: "select",
            label: tx("Link style"),
            description: tx("How the link looks in the message you send"),
            default: "none",
            options: [
                { label: tx("Plain link"), value: "none" },
                { label: tx("Hidden behind an invisible character"), value: "invisible" },
                { label: tx("Hidden behind the emoji's name"), value: "name" },
            ],
        },
        checkPermission: {
            type: "boolean",
            label: tx("Ask before sending without embed permission"),
            description: tx("Links don't show as images in channels where you can't embed links"),
            default: true,
        },
    },
    start({ store, cleanup, logger }) {
        const catalog = findByProps("canUserUse");
        const emojiUtils = findByProps("countEmoji");
        const messages = findByProps("sendMessage", "editMessage");
        const intentions = moduleAt("modules/emojis/EmojiConstants.tsx")?.EmojiIntention;
        if (!messages || !emojiUtils?.default?.getEmojiUnavailableReason || !intentions) throw new Error("Discord's emoji modules weren't found");

        const chatIntentions = new Set([intentions.CHAT, intentions.AUTO_SUGGESTION]);
        const canActuallyUse = catalog?.canUserUse?.bind(catalog);

        // Emojis and stickers show as usable in the pickers
        if (catalog?.canUserUse) cleanup(instead("canUserUse", catalog, function (this: any, args, original) {
            if (args[0] === this.STICKERS_EVERYWHERE && store.stickers) return true;
            return original.apply(this, args);
        }));
        cleanup(instead("getEmojiUnavailableReason", emojiUtils.default, function (this: any, args, original) {
            const [{ intention, bypass } = {} as any] = args;
            if (store.emojis && chatIntentions.has(intention) && !bypass) return null;
            return original.apply(this, args);
        }));

        const pickerList = moduleAt("modules/emoji_picker/native/components/EmojiPickerList.tsx")?.default;
        if (pickerList?.type) {
            const none = new Set<string>();
            cleanup(instead("type", pickerList, function (this: any, args, original) {
                const [props] = args;
                if (store.emojis && chatIntentions.has(props?.emojiPickerIntention)) {
                    for (const category of props.categories ?? []) {
                        if ("emojisDisabled" in category) {
                            category.emojisDisabled = none;
                            category.isNitroLocked = false;
                        }
                    }
                }
                return original.apply(this, args);
            }));
        } else logger.warn("Emoji picker not found; locked emojis stay greyed out but still work from autocomplete");

        const stickerRow = moduleAt("modules/stickers/native/StickerPickerListRow.tsx");
        if (stickerRow?.default) cleanup(instead("default", stickerRow, function (this: any, args, original) {
            const [props] = args;
            if (store.stickers && Array.isArray(props?.stickers)) {
                args[0] = { ...props, stickers: props.stickers.map((s: Sticker) => ({ ...s, available: true })) };
            }
            return original.apply(this, args);
        }));

        async function rewrite(channelId: string, data: MessageData) {
            if (!store.emojis || !data || typeof data.content !== "string") return;
            const channel = getStore("ChannelStore")?.getChannel?.(channelId);
            let bypassed = false;

            const replace = (emoji: Emoji) => {
                const link = `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "webp"}?size=${store.emojiSize}&name=${encodeURIComponent(emoji.name)}${emoji.animated ? "&animated=true" : ""}`;
                data.content = data.content.replace(`<${emoji.animated ? "a" : ""}:${emoji.name.replace(/~\d+$/, "")}:${emoji.id}>`, formatLink(link, emoji.name));
                bypassed = true;
            };

            if (data.invalidEmojis?.length) {
                data.invalidEmojis.forEach(replace);
                data.invalidEmojis = [];
            }
            if (data.validNonShortcutEmojis?.length) {
                const linked = new Set<Emoji>();
                for (const emoji of data.validNonShortcutEmojis) {
                    const reason = emojiUtils.default.getEmojiUnavailableReason({ channel, emoji, bypass: true });
                    if (reason == null) continue;
                    linked.add(emoji);
                    replace(emoji);
                }
                data.validNonShortcutEmojis = data.validNonShortcutEmojis.filter(e => !linked.has(e));
            }

            if (bypassed && !(await mayEmbed(channel))) throw new Error("FakeNitro: cancelled");
        }

        cleanup(
            instead("sendMessage", messages, async function (this: any, args, original) {
                try {
                    await rewrite(args[0], args[1]);
                } catch (e) {
                    if (String(e).includes("cancelled")) return;
                    logger.error("Couldn't rewrite emojis", e);
                }
                return original.apply(this, args);
            }),
            instead("editMessage", messages, async function (this: any, args, original) {
                try {
                    await rewrite(args[0], args[2]);
                } catch (e) {
                    if (String(e).includes("cancelled")) return;
                    logger.error("Couldn't rewrite emojis", e);
                }
                return original.apply(this, args);
            }),
        );

        if (messages.sendStickers) cleanup(instead("sendStickers", messages, async function (this: any, args, original) {
            const [channelId, stickerIds, ...rest] = args as [string, string[], ...unknown[]];
            if (!store.stickers) return original.apply(this, args);
            const channel = getStore("ChannelStore")?.getChannel?.(channelId);
            if (!channel) return original.apply(this, args);

            const isPrivate = channel.isPrivate?.() ?? !channel.guild_id;
            const permissions = getStore("PermissionStore");
            const canUseExternal = (canActuallyUse?.(catalog.STICKERS_EVERYWHERE) ?? false)
                && (isPrivate || permissions?.can?.(USE_EXTERNAL_STICKERS, channel));

            const links: string[] = [];
            for (const id of stickerIds) {
                const sticker: Sticker | undefined = getStore("StickersStore")?.getStickerById?.(id);
                // Discord's own stickers, and ones you can use, are sent normally
                if (!sticker || sticker.pack_id || (sticker.available !== false && (canUseExternal || sticker.guild_id === channel.guild_id))) continue;
                if (sticker.format_type === 3) {
                    openAlert("endcord-fake-nitro-lottie", <AlertModal
                        title={t("Can't send this sticker")}
                        content={t("Animated stickers made by Discord can't be sent as a link.")}
                        actions={<AlertActionButton text={t("OK")} variant="primary" />}
                    />);
                    return;
                }
                const ext = sticker.format_type === 4 ? "gif" : "png";
                links.push(formatLink(`https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=${store.stickerSize}&name=${encodeURIComponent(sticker.name)}`, sticker.name));
            }

            if (!links.length) return original.apply(this, args);
            if (!(await mayEmbed(channel))) return;
            return messages.sendMessage(channelId, { content: links.join(" "), invalidEmojis: [], validNonShortcutEmojis: [], tts: false }, ...rest);
        }));
    },
});

function formatLink(link: string, name: string) {
    switch (plugin.store.hyperlink) {
        case "invisible": return `[⠀](${link})`;
        case "name": return `[${name.replace(/[[\]]/g, "")}](${link})`;
        default: return link;
    }
}

/** Whether to send although links won't show as images in this channel */
async function mayEmbed(channel: any): Promise<boolean> {
    if (!plugin.store.checkPermission || !channel) return true;
    const isPrivate = channel.isPrivate?.() ?? !channel.guild_id;
    if (isPrivate || getStore("PermissionStore")?.can?.(EMBED_LINKS, channel)) return true;

    return new Promise(resolve => {
        openAlert("endcord-fake-nitro-embed", <AlertModal
            title={t("Links won't show as images here")}
            content={t("You can't embed links in this channel, so the emoji or sticker will be sent as a plain link. Send it anyway?")}
            actions={<AlertActions>
                <AlertActionButton text={t("Send anyway")} variant="primary" onPress={() => resolve(true)} />
                <AlertActionButton text={t("Cancel")} variant="secondary" onPress={() => resolve(false)} />
            </AlertActions>}
        />);
    });
}

export default plugin;
