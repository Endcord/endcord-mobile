/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's message context menu items, as rows in the sheet that opens when you long-press a message.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, dispatchSoon, getStore } from "../common";
import { addMessageAction, api, botMessage, command, copy, deleteMessage, displayName, edit, insertText, jumpTo, loadedMessages, messageLink, onIncomingMessage, openUrl, parseEmoji, react, send, share } from "../hooks";
import { choose, showText } from "../ui/dialogs";

const isMine = (message: any) => message.author?.id === currentUserId();

interface Media {
    url: string;
    label: string;
    image: boolean;
}

/** Every attachment and embed picture, video and file in a message */
function mediaOf(message: any): Media[] {
    const media: Media[] = [];
    for (const a of message.attachments ?? []) {
        const image = /^image\//.test(a.content_type ?? "") || /\.(png|jpe?g|gif|webp|avif)$/i.test(a.filename ?? "");
        media.push({ url: a.url ?? a.proxy_url, label: a.filename ?? t("Attachment"), image });
    }
    for (const e of message.embeds ?? []) {
        const picture = e.image?.url ?? e.thumbnail?.url;
        if (e.video?.url) media.push({ url: e.video.url, label: e.title ?? e.rawTitle ?? t("Video"), image: false });
        if (picture) media.push({ url: picture, label: e.title ?? e.rawTitle ?? t("Image"), image: true });
    }
    return media.filter(m => m.url);
}

/** One of several things, from a sheet, or the only one right away */
function pickOne<T>(title: string, items: T[], label: (item: T) => string, then: (item: T) => void) {
    if (items.length === 1) then(items[0]);
    else choose(title, items.map(item => ({ label: label(item), value: item })), then);
}

const CopyMediaLink = definePlugin({
    id: "endcord.copy-media-link",
    name: "CopyMediaLink",
    description: tx("Copy the link of a message's images, videos and files from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "copy-media-link",
            icon: "LinkIcon",
            label: () => t("Copy Media Link"),
            visible: message => mediaOf(message).length > 0,
            onPress: message => pickOne(t("Copy Media Link"), mediaOf(message), m => m.label, m => copy(m.url)),
        }));
    },
});

const STICKER_EXT: Record<number, string> = { 1: "png", 2: "png", 3: "json", 4: "gif" };
const stickerUrl = (s: any) => `https://media.discordapp.net/stickers/${s.id}.${STICKER_EXT[s.format_type ?? s.formatType] ?? "png"}`;

const CopyStickerLinks = definePlugin({
    id: "endcord.copy-sticker-links",
    name: "CopyStickerLinks",
    description: tx("Adds the ability to copy & open Sticker links"),
    authors: [ENDCORD_AUTHOR],
    icon: "StickerIcon",
    tags: ["Emotes", "Utility"],
    start({ cleanup }) {
        const stickers = (message: any): any[] => message.stickerItems ?? message.stickers ?? [];
        cleanup(
            addMessageAction({
                key: "copy-sticker-link",
                icon: "StickerIcon",
                label: () => t("Copy Sticker Link"),
                visible: message => stickers(message).length > 0,
                onPress: message => pickOne(t("Copy Sticker Link"), stickers(message), s => s.name, s => copy(stickerUrl(s))),
            }),
            addMessageAction({
                key: "open-sticker-link",
                icon: "LinkExternalSmallIcon",
                label: () => t("Open Sticker Link"),
                visible: message => stickers(message).length > 0,
                onPress: message => pickOne(t("Open Sticker Link"), stickers(message), s => s.name, s => openUrl(stickerUrl(s))),
            }),
        );
    },
});

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodes base64 to text, or undefined when it isn't valid base64 of valid UTF-8 */
export function decodeBase64(input: string): string | undefined {
    const clean = input.replace(/=+$/, "");
    if (!clean || /[^A-Za-z0-9+/]/.test(clean) || clean.length % 4 === 1) return;
    const bytes: number[] = [];
    let buffer = 0, bits = 0;
    for (const c of clean) {
        buffer = buffer << 6 | B64.indexOf(c);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push(buffer >> bits & 0xFF);
        }
    }
    let out = "";
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        const extra = b < 0x80 ? 0 : b >> 5 === 6 ? 1 : b >> 4 === 14 ? 2 : b >> 3 === 30 ? 3 : -1;
        if (extra < 0 || i + extra >= bytes.length + (extra ? 0 : 1)) return;
        let code = extra ? b & (0x3F >> extra) : b;
        for (let j = 1; j <= extra; j++) {
            const next = bytes[i + j];
            if (next >> 6 !== 2) return;
            code = code << 6 | next & 0x3F;
        }
        // Control characters mean this wasn't text
        if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) return;
        out += String.fromCodePoint(code);
        i += extra + 1;
    }
    return out;
}

const base64In = (content: string) => (content.match(/\b[A-Za-z0-9+/]{8,}={0,2}/g) ?? []).map(decodeBase64).filter((d): d is string => !!d && d.length >= 3);

const DecodeBase64 = definePlugin({
    id: "endcord.decode-base64",
    name: "DecodeBase64",
    description: tx("Decode base64 content of any message and copy the decoded content."),
    authors: [ENDCORD_AUTHOR],
    icon: "CodeIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "decode-base64",
            icon: "CodeIcon",
            label: () => t("Decode Base64"),
            visible: message => base64In(message.content ?? "").length > 0,
            onPress: message => showText(t("Decoded Base64"), base64In(message.content).join("\n\n")),
        }));
    },
});

const HideMedia = definePlugin({
    id: "endcord.hide-media",
    name: "HideMedia",
    description: tx("Hide the attachments and embeds of a message from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeSlashIcon",
    tags: ["Media", "Chat"],
    start({ cleanup }) {
        const hidden = new Set<string>();
        const channelOf = new Map<string, string>();
        const restore = async (channelId: string, id: string) => {
            // The original attachments and embeds come from the server, exactly as they were
            const [message] = await api("get", `/channels/${channelId}/messages?limit=1&around=${id}`);
            if (message?.id === id) dispatchSoon({ type: "MESSAGE_UPDATE", message });
        };
        cleanup(
            () => {
                for (const id of hidden) {
                    const channelId = channelOf.get(id);
                    if (channelId) restore(channelId, id).catch(() => { });
                }
                hidden.clear();
            },
            onIncomingMessage("hide-media", message => hidden.has(message.id) ? { ...message, attachments: [], embeds: [] } : undefined),
            addMessageAction({
                key: "hide-media",
                icon: "EyeSlashIcon",
                label: message => hidden.has(message.id) ? t("Show Media") : t("Hide Media"),
                visible: message => hidden.has(message.id) || mediaOf(message).length > 0,
                onPress: message => {
                    channelOf.set(message.id, message.channel_id);
                    if (hidden.delete(message.id)) {
                        restore(message.channel_id, message.id).catch(e => showToast(String(e?.message ?? e), findAssetId("CircleXIcon-primary")));
                    } else {
                        hidden.add(message.id);
                        dispatchSoon({ type: "MESSAGE_UPDATE", message: { id: message.id, channel_id: message.channel_id, attachments: [], embeds: [] } });
                    }
                },
            }),
        );
    },
});

const Husk = definePlugin({
    id: "endcord.husk",
    name: "Husk",
    description: tx("React with husk from the message menu (change the emoji in settings)"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Emotes", "Fun"],
    settings: {
        emoji: {
            type: "string",
            label: tx("Emoji"),
            description: tx("The emoji to react with, like 💀 or <:husk:1026532993923293184>"),
            default: "<:husk:1026532993923293184>",
        },
    },
    start({ store, cleanup }) {
        cleanup(addMessageAction({
            key: "husk",
            icon: "ReactionIcon",
            label: () => t("Husk"),
            onPress: message => {
                const emoji = parseEmoji(store.emoji) ?? parseEmoji("<:husk:1026532993923293184>")!;
                Promise.resolve(react(message.channel_id, message.id, emoji)).catch(() => showToast(t("Couldn't react with that emoji"), findAssetId("CircleXIcon-primary")));
            },
        }));
    },
});

const QuickMention = definePlugin({
    id: "endcord.quick-mention",
    name: "QuickMention",
    description: tx("Mention a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "AtIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "quick-mention",
            icon: "AtIcon",
            label: () => t("Mention"),
            visible: message => !!message.author?.id,
            onPress: message => {
                const mention = `<@${message.author.id}> `;
                if (!insertText(message.channel_id, mention)) copy(mention.trim(), t("Mention copied"));
            },
        }));
    },
});

const RepeatMessages = definePlugin({
    id: "endcord.repeat-messages",
    name: "RepeatMessages",
    description: tx("Send a message again from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "RetryIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "repeat-messages",
            icon: "RetryIcon",
            label: () => t("Repeat Message"),
            visible: message => !!message.content?.trim(),
            onPress: message => send(message.channel_id, message.content),
        }));
    },
});

const ENGINES: Record<string, string> = {
    Google: "https://lens.google.com/uploadbyurl?url=",
    Yandex: "https://yandex.com/images/search?rpt=imageview&url=",
    SauceNAO: "https://saucenao.com/search.php?url=",
    IQDB: "https://iqdb.org/?url=",
    Bing: "https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:",
    TinEye: "https://www.tineye.com/search?url=",
    ImgOps: "https://imgops.com/start?url=",
};

const ReverseImageSearch = definePlugin({
    id: "endcord.reverse-image-search",
    name: "ReverseImageSearch",
    description: tx("Search for a message's image on Google Lens, Yandex, SauceNAO and more from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "MagnifyingGlassIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        const images = (message: any) => mediaOf(message).filter(m => m.image);
        cleanup(addMessageAction({
            key: "reverse-image-search",
            icon: "MagnifyingGlassIcon",
            label: () => t("Search Image"),
            visible: message => images(message).length > 0,
            onPress: message => pickOne(t("Search Image"), images(message), m => m.label, image => {
                choose(t("Search Image"), Object.keys(ENGINES).map(name => ({ label: name, value: name })), engine => {
                    openUrl(ENGINES[engine] + encodeURIComponent(image.url));
                });
            }),
        }));
    },
});

/** A message as JSON, without the parts that point back at stores */
function rawJson(message: any) {
    const seen = new WeakSet();
    return JSON.stringify(message, (key, value) => {
        if (key.startsWith("_")) return undefined;
        if (value && typeof value === "object") {
            if (seen.has(value)) return undefined;
            seen.add(value);
        }
        return value;
    }, 2);
}

const ViewRaw = definePlugin({
    id: "endcord.view-raw",
    name: "ViewRaw",
    description: tx("View and copy the raw content and data of any message"),
    authors: [ENDCORD_AUTHOR],
    icon: "CodeIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(
            addMessageAction({
                key: "view-raw",
                icon: "CodeIcon",
                label: () => t("View Raw"),
                onPress: message => showText(t("View Raw"), message.content ? `${message.content}\n\n${rawJson(message)}` : rawJson(message)),
            }),
            addMessageAction({
                key: "copy-raw",
                icon: "CopyIcon",
                label: () => t("Copy Raw"),
                visible: message => !!message.content,
                onPress: message => copy(message.content),
            }),
        );
    },
});

const SilentDelete = definePlugin({
    id: "endcord.silent-delete",
    name: "SilentDelete",
    description: tx("\"Silently\" deletes a message. Bypass message loggers by replacing the message with a placeholder."),
    authors: [ENDCORD_AUTHOR],
    icon: "TrashIcon",
    tags: ["Privacy", "Chat"],
    settings: {
        replacementText: { type: "string", label: tx("Replacement text"), description: tx("Text to replace the message with before deletion."), default: "** **" },
        deleteDelay: { type: "number", label: tx("Delay (milliseconds)"), description: tx("Delay in milliseconds before deleting the replacement message (recommended at least 200)."), default: 200, min: 0, max: 10000 },
    },
    start({ store, cleanup }) {
        cleanup(addMessageAction({
            key: "silent-delete",
            icon: "TrashIcon",
            danger: true,
            label: () => t("Silent Delete"),
            visible: isMine,
            onPress: async message => {
                try {
                    await edit(message.channel_id, message.id, store.replacementText || "** **");
                    setTimeout(() => deleteMessage(message.channel_id, message.id), store.deleteDelay);
                } catch {
                    showToast(t("Couldn't delete the message"), findAssetId("CircleXIcon-primary"));
                }
            },
        }));
    },
});

const FindReply = definePlugin({
    id: "endcord.find-reply",
    name: "FindReply",
    description: tx("Jumps to the earliest reply to a message in a channel (lets you follow past conversations more easily)."),
    authors: [ENDCORD_AUTHOR],
    icon: "ArrowAngleLeftUpIcon",
    tags: ["Chat"],
    settings: {
        includePings: { type: "boolean", label: tx("Include mentions"), description: tx("Will also search for messages that @ the author directly"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(addMessageAction({
            key: "find-reply",
            icon: "ArrowAngleLeftUpIcon",
            label: () => t("Find Reply"),
            onPress: message => {
                const reply = loadedMessages(message.channel_id).find(m =>
                    m.id !== message.id && Number(m.id) > Number(message.id) && (
                        m.messageReference?.message_id === message.id
                        || store.includePings && (m.mentions ?? []).some((u: any) => (u?.id ?? u) === message.author?.id)
                    ));
                if (reply) jumpTo(message.channel_id, reply.id);
                else showToast(t("No replies to this message in the loaded messages"), findAssetId("CircleInformationIcon-primary"));
            },
        }));
    },
});

const TEXT_FILE = /\.(txt|md|log|json|ya?ml|toml|ini|cfg|conf|csv|xml|html?|css|s?[cj]ss|[cm]?[jt]sx?|py|rb|go|rs|java|kt|kts|c|h|cpp|hpp|cs|php|lua|sh|bat|ps1|sql|gradle|properties|diff|patch)$/i;

const CopyFileContents = definePlugin({
    id: "endcord.copy-file-contents",
    name: "CopyFileContents",
    description: tx("Copy the contents of text file attachments from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "CopyIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        const files = (message: any): any[] => (message.attachments ?? []).filter((a: any) => /^text\//.test(a.content_type ?? "") || TEXT_FILE.test(a.filename ?? ""));
        cleanup(addMessageAction({
            key: "copy-file-contents",
            icon: "CopyIcon",
            label: () => t("Copy File Contents"),
            visible: message => files(message).length > 0,
            onPress: message => pickOne(t("Copy File Contents"), files(message), f => f.filename, async file => {
                if (file.size > 2_000_000) {
                    showToast(t("This file is too big to copy"), findAssetId("CircleXIcon-primary"));
                    return;
                }
                try {
                    copy(await fetch(file.url).then(r => r.text()));
                } catch {
                    showToast(t("Couldn't download the file"), findAssetId("CircleXIcon-primary"));
                }
            }),
        }));
    },
});

const CopyUserMention = definePlugin({
    id: "endcord.copy-user-mention",
    name: "CopyUserMention",
    description: tx("Copy the mention of a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "AtIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "copy-user-mention",
            icon: "AtIcon",
            label: () => t("Copy User Mention"),
            visible: message => !!message.author?.id,
            onPress: message => copy(`<@${message.author.id}>`),
        }));
    },
});

const CopyUserURLs = definePlugin({
    id: "endcord.copy-user-urls",
    name: "CopyUserURLs",
    description: tx("Copy a link to the profile of a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "copy-user-url",
            icon: "LinkIcon",
            label: () => t("Copy User URL"),
            visible: message => !!message.author?.id,
            onPress: message => copy(`https://discord.com/users/${message.author.id}`),
        }));
    },
});

const SUPPRESS_EMBEDS = 1 << 2;

const UnsuppressEmbeds = definePlugin({
    id: "endcord.unsuppress-embeds",
    name: "UnsuppressEmbeds",
    description: tx("Allows you to unsuppress embeds in messages"),
    authors: [ENDCORD_AUTHOR],
    icon: "EmbedIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        const canManage = (channel: any) => {
            const permissions = findByProps("Permissions", "ChannelTypes")?.Permissions;
            return !!(permissions && getStore("PermissionStore")?.can?.(permissions.MANAGE_MESSAGES, channel));
        };
        cleanup(addMessageAction({
            key: "unsuppress-embeds",
            icon: "EmbedIcon",
            label: message => message.flags & SUPPRESS_EMBEDS ? t("Unsuppress Embeds") : t("Suppress Embeds"),
            visible: (message, channel) => /https?:\/\//.test(message.content ?? "") && (isMine(message) || !!channel?.guild_id && canManage(channel)),
            onPress: message => {
                api("patch", `/channels/${message.channel_id}/messages/${message.id}`, { flags: message.flags ^ SUPPRESS_EMBEDS })
                    .catch(() => showToast(t("Couldn't change the embeds"), findAssetId("CircleXIcon-primary")));
            },
        }));
    },
});

const IS_VOICE_MESSAGE = 1 << 13;

const VoiceDownload = definePlugin({
    id: "endcord.voice-download",
    name: "VoiceDownload",
    description: tx("Download voice messages from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "DownloadIcon",
    tags: ["Voice", "Media"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "voice-download",
            icon: "DownloadIcon",
            label: () => t("Download Voice Message"),
            visible: message => !!(message.flags & IS_VOICE_MESSAGE) && !!message.attachments?.[0]?.url,
            onPress: message => openUrl(message.attachments[0].url),
        }));
    },
});

const DownloadAllAttachments = definePlugin({
    id: "endcord.download-all-attachments",
    name: "DownloadAllAttachments",
    description: tx("Download every attachment of a message at once from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "DownloadIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "download-all-attachments",
            icon: "DownloadIcon",
            label: () => t("Download All Attachments"),
            visible: message => (message.attachments?.length ?? 0) > 1,
            onPress: message => {
                // Android downloads each link the browser is given; they're opened one at a time so none is dropped
                (message.attachments as any[]).forEach((a, i) => setTimeout(() => openUrl(a.url), i * 1200));
                showToast(t("Downloading {count} attachments", { count: message.attachments.length }), findAssetId("DownloadIcon"));
            },
        }));
    },
});

const emojisIn = (content: string) => [...new Set(content.match(/<a?:\w+:\d+>/g) ?? [])];

const CopyEmojiMarkdown = definePlugin({
    id: "endcord.copy-emoji-markdown",
    name: "CopyEmojiMarkdown",
    description: tx("Allows you to copy emojis as formatted string (<:blobcatcozy:1026533070955872337>)"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Emotes"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "copy-emoji-markdown",
            icon: "ReactionIcon",
            label: () => t("Copy Emoji Markdown"),
            visible: message => emojisIn(message.content ?? "").length > 0,
            onPress: message => pickOne(t("Copy Emoji Markdown"), emojisIn(message.content), e => e.replace(/^<a?:(\w+):\d+>$/, ":$1:"), e => copy(e)),
        }));
    },
});

const ExportMessages = definePlugin({
    id: "endcord.export-messages",
    name: "ExportMessages",
    description: tx("Share any message as text from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShareIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "export-message",
            icon: "ShareIcon",
            label: () => t("Export Message"),
            onPress: message => {
                const time = typeof message.timestamp?.toDate === "function" ? message.timestamp.toDate() : new Date(message.timestamp);
                const lines = [
                    `${displayName(message.author)} (@${message.author?.username}) — ${time.toLocaleString()}`,
                    message.content,
                    ...mediaOf(message).map(m => m.url),
                    messageLink(message.channel_id, message.id),
                ].filter(Boolean);
                share(lines.join("\n"));
            },
        }));
    },
});

const MUSIC_LINK = /https?:\/\/(?:open\.spotify\.com|music\.apple\.com|music\.youtube\.com|(?:www\.)?deezer\.com|(?:listen\.)?tidal\.com|soundcloud\.com|music\.amazon\.[a-z.]+)\/\S+/i;

const SongLink = definePlugin({
    id: "endcord.song-link",
    name: "SongLink",
    description: tx("Open song links on your streaming service through song.link, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "MusicIcon",
    tags: ["Media"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "song-link",
            icon: "MusicIcon",
            label: () => t("Open in Other Services"),
            visible: message => MUSIC_LINK.test(message.content ?? ""),
            onPress: message => openUrl(`https://song.link/${message.content.match(MUSIC_LINK)![0]}`),
        }));
    },
});

// UnitConverter: what each unit is in its counterpart system
const UNITS: Array<{ re: RegExp; convert: (n: number) => string; }> = [
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:km|kilometers?|kilometres?)\b/gi, convert: n => `${round(n * 0.621371)} mi` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:mi|miles?)\b/gi, convert: n => `${round(n * 1.609344)} km` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:cm|centimeters?|centimetres?)\b/gi, convert: n => `${round(n / 2.54)} in` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:in|inch(?:es)?|")(?=\s|$|[.,!?])/gi, convert: n => `${round(n * 2.54)} cm` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:m|meters?|metres?)\b/gi, convert: n => `${round(n * 3.28084)} ft` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:ft|feet|foot|')(?=\s|$|[.,!?])/gi, convert: n => `${round(n * 0.3048)} m` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:kg|kilograms?|kilos?)\b/gi, convert: n => `${round(n * 2.20462)} lb` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:lbs?|pounds?)\b/gi, convert: n => `${round(n * 0.453592)} kg` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:g|grams?)\b/gi, convert: n => `${round(n / 28.3495)} oz` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:oz|ounces?)\b/gi, convert: n => `${round(n * 28.3495)} g` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*C|celsius)\b/gi, convert: n => `${round(n * 9 / 5 + 32)} °F` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*F|fahrenheit)\b/gi, convert: n => `${round((n - 32) * 5 / 9)} °C` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:l|liters?|litres?)\b/gi, convert: n => `${round(n * 0.264172)} gal` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:gal|gallons?)\b/gi, convert: n => `${round(n * 3.78541)} L` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*(?:km\/h|kph)\b/gi, convert: n => `${round(n * 0.621371)} mph` },
    { re: /(-?\d+(?:[.,]\d+)?)\s*mph\b/gi, convert: n => `${round(n * 1.609344)} km/h` },
];
const round = (n: number) => Math.round(n * 100) / 100;

export function convertUnits(text: string): string[] {
    const found: Array<{ index: number; line: string; }> = [];
    const taken: Array<[number, number]> = [];
    for (const { re, convert } of UNITS) {
        for (const match of text.matchAll(re)) {
            const start = match.index ?? 0, end = start + match[0].length;
            // km/h is not also km, and "5 km" is not also "5 m"
            if (taken.some(([s, e]) => start < e && end > s)) continue;
            taken.push([start, end]);
            found.push({ index: start, line: `${match[0].trim()} ≈ ${convert(Number(match[1].replace(",", ".")))}` });
        }
    }
    return found.sort((a, b) => a.index - b.index).map(f => f.line);
}

const UnitConverter = definePlugin({
    id: "endcord.unit-converter",
    name: "UnitConverter",
    description: tx("Convert metric and imperial units in a message from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "RulerIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "unit-converter",
            icon: "RulerIcon",
            label: () => t("Convert Units"),
            visible: message => convertUnits(message.content ?? "").length > 0,
            onPress: message => showText(t("Convert Units"), convertUnits(message.content).join("\n")),
        }));
    },
});

const QuickDelete = definePlugin({
    id: "endcord.quick-delete",
    name: "QuickDelete",
    description: tx("Delete your last message in a channel with /deletelast, or any of yours from the message menu without confirming"),
    authors: [ENDCORD_AUTHOR],
    icon: "TrashIcon",
    tags: ["Chat"],
    settings: {
        showConfirmToast: { type: "boolean", label: tx("Confirm with a toast"), description: tx("Show a toast after deleting."), default: true },
    },
    start({ store, cleanup }) {
        cleanup(
            command({
                name: "deletelast",
                description: tx("Delete your last message in this channel"),
                run: (_, ctx) => {
                    const last = [...loadedMessages(ctx.channel.id)].reverse().find(isMine);
                    if (!last) {
                        botMessage(ctx.channel.id, t("You have no messages loaded in this channel."));
                        return;
                    }
                    deleteMessage(ctx.channel.id, last.id);
                    if (store.showConfirmToast) showToast(t("Deleted your last message"), findAssetId("TrashIcon"));
                },
            }),
            addMessageAction({
                key: "quick-delete",
                icon: "TrashIcon",
                danger: true,
                label: () => t("Delete Without Confirming"),
                visible: isMine,
                onPress: message => {
                    deleteMessage(message.channel_id, message.id);
                    if (store.showConfirmToast) showToast(t("Message deleted"), findAssetId("TrashIcon"));
                },
            }),
        );
    },
});

export default [
    CopyMediaLink, CopyStickerLinks, DecodeBase64, HideMedia, Husk, QuickMention, RepeatMessages, ReverseImageSearch,
    ViewRaw, SilentDelete, FindReply, CopyFileContents, CopyUserMention, CopyUserURLs, UnsuppressEmbeds, VoiceDownload,
    DownloadAllAttachments, CopyEmojiMarkdown, ExportMessages, SongLink, UnitConverter, QuickDelete,
];
