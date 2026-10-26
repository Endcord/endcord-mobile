/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * More of Endcord PC's message plugins: links to messages, spoilers, emojis, quotes, secret messages and archives.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR, onSettingChange } from "../api";
import { currentUserId, getStore, onAction, subscribe } from "../common";
import { fromBase64, open, seal, toBase64 } from "../crypto";
import {
    addMessageAction, api, botMessage, command, copy, displayName, edit, getChannel, getUser, insertText, jumpTo,
    loadedMessages, messageLink, onIncomingMessage, onMessageRow, onSend, parseEmoji, parseMessageLink, react,
    receiveLocalMessage, redrawMessage, textNode,
} from "../hooks";
import { prompt, showText } from "../ui/dialogs";
import LogList from "../ui/LogList";

const preview = (text: string, length = 100) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};
const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));

// MessageLinkEmbeds ----------------------------------------------------------------------------------------------------

const MessageLinkEmbeds = definePlugin({
    id: "endcord.message-link-embeds",
    name: "MessageLinkEmbeds",
    description: tx("Adds a preview to messages that link another message"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        // Linked message ID to its preview, or null while it's loading or when it can't be seen
        const previews = new Map<string, string | null>();
        const describe = (m: any) => `${displayName(m.author)}: ${preview(m.content || (m.attachments?.length ? t("Sent an attachment") : ""), 160)}`;
        cleanup(onMessageRow("message-link-embeds", (row, message) => {
            const link = parseMessageLink(String(message.content ?? ""));
            if (!link || !Array.isArray(row.content) || link.messageId === message.id) return;
            let text = previews.get(link.messageId);
            if (text === undefined) {
                const stored = getStore("MessageStore")?.getMessage?.(link.channelId, link.messageId);
                if (stored) previews.set(link.messageId, text = describe(stored));
                else {
                    previews.set(link.messageId, null);
                    api("get", `/channels/${link.channelId}/messages?around=${link.messageId}&limit=1`)
                        .then(([found]: any[]) => {
                            if (found?.id !== link.messageId) return;
                            previews.set(link.messageId, describe({ ...found, author: { ...found.author, globalName: found.author?.global_name } }));
                            redrawMessage(message.channel_id, message.id);
                        })
                        .catch(() => { });
                }
            }
            if (text) row.content = [...row.content, textNode(`\n↪ ${text}`)];
        }));
    },
});

// RevealAllSpoilers ----------------------------------------------------------------------------------------------------

function unspoil(nodes: any[]): any[] {
    return nodes.flatMap(node => {
        if (node?.type === "spoiler") return Array.isArray(node.content) ? unspoil(node.content) : [textNode(String(node.content ?? ""))];
        if (Array.isArray(node?.content)) return [{ ...node, content: unspoil(node.content) }];
        return [node];
    });
}

const RevealAllSpoilers = definePlugin({
    id: "endcord.reveal-all-spoilers",
    name: "RevealAllSpoilers",
    description: tx("Reveal every spoiler in a message from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        const revealed = new Set<string>();
        cleanup(
            () => revealed.clear(),
            onMessageRow("reveal-all-spoilers", (row, message) => {
                if (revealed.has(message.id) && Array.isArray(row.content)) row.content = unspoil(row.content);
            }),
            addMessageAction({
                key: "reveal-all-spoilers",
                icon: "EyeIcon",
                label: () => t("Reveal Spoilers"),
                visible: message => !revealed.has(message.id) && /\|\|[\s\S]+?\|\|/.test(message.content ?? ""),
                onPress: message => {
                    revealed.add(message.id);
                    redrawMessage(message.channel_id, message.id);
                },
            }),
        );
    },
});

// WhitelistedEmojis ----------------------------------------------------------------------------------------------------

const WhitelistedEmojis = definePlugin({
    id: "endcord.whitelisted-emojis",
    name: "WhitelistedEmojis",
    description: tx("Adds the ability to disable all message emojis except for a whitelisted set."),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Emotes", "Chat"],
    settings: {
        whitelist: { type: "string", label: tx("Allowed emojis"), description: tx("Names or IDs of the custom emojis still shown, separated by commas"), default: "" },
    },
    start({ store, cleanup }) {
        cleanup(onIncomingMessage("whitelisted-emojis", message => {
            const content: string = message.content ?? "";
            if (!content.includes("<")) return;
            const allowed = ids(store.whitelist.toLowerCase());
            const replaced = content.replace(/<a?:(\w+):(\d+)>/g, (m, name: string, id: string) => allowed.has(name.toLowerCase()) || allowed.has(id) ? m : `:${name}:`);
            return replaced !== content ? { ...message, content: replaced } : undefined;
        }));
    },
});

// Quoter ---------------------------------------------------------------------------------------------------------------

const Quoter = definePlugin({
    id: "endcord.quoter",
    name: "Quoter",
    description: tx("Quote a message into your message box with its author, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "quoter",
            icon: "ChatIcon",
            label: () => t("Quote"),
            visible: message => !!message.content?.trim(),
            onPress: message => {
                const quote = `${message.content.split("\n").map((l: string) => `> ${l}`).join("\n")}\n— <@${message.author.id}>\n`;
                if (!insertText(message.channel_id, quote)) copy(quote);
            },
        }));
    },
});

// SedEnhanced ----------------------------------------------------------------------------------------------------------

const SED = /^s([/|#@!$%])((?:\\.|(?!\1).)*)\1((?:\\.|(?!\1).)*)\1?([gimsuyr]*)$/;

const SedEnhanced = definePlugin({
    id: "endcord.sed-enhanced",
    name: "SedEnhanced",
    description: tx("Edit your last message with s/find/replace/, with regular expressions, flags and other separators like s|a|b|g"),
    authors: [ENDCORD_AUTHOR],
    icon: "PencilIcon",
    tags: ["Chat"],
    settings: {
        regexByDefault: { type: "boolean", label: tx("Regular expressions by default"), description: tx("Inverts the `r` flag, so using the `r` flag enables non-regex mode, and omitting it uses regex mode."), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onSend("sed-enhanced", (content, { channelId, editing }) => {
            const match = !editing && content.trim().match(SED);
            if (!match) return;
            const [, , find, replace, flags] = match;
            const target = [...loadedMessages(channelId)].reverse().find(m => m.author?.id === currentUserId() && m.content);
            if (!target) return null;
            const regex = flags.includes("r") !== store.regexByDefault;
            let pattern: string | RegExp = find.replace(/\\(.)/g, regex ? "\\$1" : "$1");
            try {
                if (regex) pattern = new RegExp(pattern as string, flags.replace(/r/g, ""));
            } catch {
                showToast(t("That isn't a valid regular expression"), findAssetId("CircleXIcon-primary"));
                return null;
            }
            const replacement = replace.replace(/\\(.)/g, "$1");
            const updated = typeof pattern === "string"
                ? flags.includes("g") ? target.content.split(pattern).join(replacement) : target.content.replace(pattern, replacement)
                : target.content.replace(pattern, replacement);
            if (updated !== target.content) edit(channelId, target.id, updated);
            return null;
        }, -20));
    },
});

// GifPaste -------------------------------------------------------------------------------------------------------------

const GifPaste = definePlugin({
    id: "endcord.gif-paste",
    name: "GifPaste",
    description: tx("Makes picking a gif in the gif picker insert a link into the chatbox instead of instantly sending it"),
    authors: [ENDCORD_AUTHOR],
    icon: "GifIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        cleanup(onSend("gif-paste", (content, { channelId, editing, options }) => {
            if (editing || options?.location !== "gif_reply") return;
            return insertText(channelId, `${content} `) ? null : undefined;
        }, -30));
    },
});

// TenorGifFix ----------------------------------------------------------------------------------------------------------

/** Tenor's video previews to the GIF they come from */
function tenorGif(url: string): string | undefined {
    const path = url.split("/");
    const index = path.findIndex(part => part.endsWith(".tenor.com"));
    if (index === -1) return;
    const [host, id, file] = path.slice(index, index + 3);
    if (!host || !id || !file) return;
    return `https://${host}/${id.slice(0, -2)}AC/${file.split(".")[0]}.gif`;
}

const TenorGifFix = definePlugin({
    id: "endcord.tenor-gif-fix",
    name: "TenorGifFix",
    description: tx("Saves Tenor GIFs as real GIFs instead of videos"),
    authors: [ENDCORD_AUTHOR],
    icon: "GifIcon",
    tags: ["Media"],
    start({ cleanup }) {
        const media = findByProps("downloadMediaAsset");
        if (typeof media?.downloadMediaAsset !== "function") throw new Error("Discord's media saver wasn't found");
        cleanup(before("downloadMediaAsset", media, (args: any[]) => {
            const gif = typeof args[0] === "string" ? tenorGif(args[0]) : undefined;
            if (gif) {
                args[0] = gif;
                // An image, not a video
                args[1] = 1;
            }
        }));
    },
});

// DontRoundMyTimestamps ------------------------------------------------------------------------------------------------

const DontRoundMyTimestamps = definePlugin({
    id: "endcord.dont-round-my-timestamps",
    name: "DontRoundMyTimestamps",
    description: tx("Always rounds relative timestamps down, so 7.6y becomes 7y instead of 8y"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Chat"],
    start({ cleanup }) {
        const moment = findByProps("relativeTimeRounding", "utc") ?? findByProps("relativeTimeRounding");
        if (typeof moment?.relativeTimeRounding !== "function") throw new Error("Discord's time formatting wasn't found");
        const previous = moment.relativeTimeRounding();
        moment.relativeTimeRounding(Math.floor);
        cleanup(() => moment.relativeTimeRounding(previous ?? Math.round));
    },
});

// MessageLoggerEnhanced ------------------------------------------------------------------------------------------------

interface Archived {
    id: string;
    channelId: string;
    author: string;
    content: string;
    at: number;
    kind: "deleted" | "edited";
    before?: string;
}

const archive = wrapSync(createStorage<{ items: Archived[]; }>(createMMKVBackend("ENDCORD_MESSAGE_ARCHIVE", { items: [] })));
const archived = () => Array.isArray(archive.items) ? archive.items : [];

function ArchivePage() {
    useProxy(archive);
    return <LogList
        title={t("Deleted and Edited Messages")}
        empty={t("Deleted and edited messages are kept here, even after Discord restarts")}
        entries={archived().map((m, i) => ({
            key: `${m.id}-${i}`,
            label: `${m.kind === "deleted" ? "🗑" : "✏️"} ${m.author}: ${preview(m.kind === "edited" ? `${m.before} → ${m.content}` : m.content)}`,
            subLabel: `${getChannel(m.channelId)?.name ? `#${getChannel(m.channelId).name}` : t("Direct Message")} · ${new Date(m.at).toLocaleString()}`,
            onPress: () => jumpTo(m.channelId, m.id),
        }))}
        onClear={() => void (archive.items = [])}
    />;
}

const MessageLoggerEnhanced = definePlugin({
    id: "endcord.message-logger-enhanced",
    name: "MessageLoggerEnhanced",
    description: tx("Keeps deleted and edited messages after Discord restarts, with a list to browse them and /deleted"),
    authors: [ENDCORD_AUTHOR],
    icon: "TrashIcon",
    tags: ["Chat", "Utility"],
    settings: {
        keep: { type: "number", label: tx("Messages to keep"), description: tx("Older ones are removed"), default: 500, min: 50, max: 5000 },
        ignoreSelf: { type: "boolean", label: tx("Ignore yourself"), description: tx("Don't log your own messages"), default: true },
        ignoreBots: { type: "boolean", label: tx("Ignore bots"), description: tx("Don't log messages from bots"), default: true },
    },
    SettingsComponent: ArchivePage,
    async start({ store, cleanup }) {
        await awaitStorage(archive);
        let pending: Archived[] = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        const add = (item: Archived) => {
            pending.push(item);
            timer ??= setTimeout(() => {
                timer = undefined;
                archive.items = [...pending.reverse(), ...archived()].slice(0, store.keep);
                pending = [];
            }, 1000);
        };
        const skip = (m: any) => !m?.content || store.ignoreSelf && m.author?.id === currentUserId() || store.ignoreBots && m.author?.bot;
        cleanup(
            () => clearTimeout(timer),
            onAction<{ id: string; channelId: string; endcordLocal?: boolean; }>("MESSAGE_DELETE", ({ id, channelId, endcordLocal }) => {
                const m = endcordLocal ? undefined : getStore("MessageStore")?.getMessage?.(channelId, id);
                if (m && !skip(m)) add({ id, channelId, author: displayName(m.author), content: m.content, at: Date.now(), kind: "deleted" });
            }, { first: true }),
            onAction<{ message?: any; }>("MESSAGE_UPDATE", ({ message: update }) => {
                if (update?.content === undefined) return;
                const m = getStore("MessageStore")?.getMessage?.(update.channel_id, update.id);
                if (m && !skip(m) && m.content !== update.content) add({ id: m.id, channelId: m.channel_id, author: displayName(m.author), content: update.content, before: m.content, at: Date.now(), kind: "edited" });
            }, { first: true }),
            command({
                name: "deleted",
                description: tx("Show the messages deleted in this chat (only you see it)"),
                run: (_, ctx) => {
                    const here = archived().filter(m => m.channelId === ctx.channel.id && m.kind === "deleted").slice(0, 20);
                    botMessage(ctx.channel.id, here.length
                        ? here.map(m => `🗑 **${m.author}** <t:${Math.floor(m.at / 1000)}:R>: ${preview(m.content, 200)}`).join("\n")
                        : t("No deleted messages from this chat were kept."));
                },
            }),
        );
    },
});

// MessageVault ---------------------------------------------------------------------------------------------------------

interface Indexed {
    i: string;
    c: string;
    a: string;
    n: string;
    t: number;
    x: string;
}

const vault = wrapSync(createStorage<{ items: Indexed[]; }>(createMMKVBackend("ENDCORD_MESSAGE_VAULT", { items: [] })));

const MessageVault = definePlugin({
    id: "endcord.message-vault",
    name: "MessageVault",
    description: tx("Search messages you have read by keyword and person with /vault, even after they scroll away. Indexed on your device only."),
    authors: [ENDCORD_AUTHOR],
    icon: "MagnifyingGlassIcon",
    tags: ["Utility", "Chat"],
    settings: {
        indexServers: { type: "boolean", label: tx("Servers"), description: tx("Index messages from servers"), default: true },
        indexDirectMessages: { type: "boolean", label: tx("Direct messages"), description: tx("Index direct messages"), default: true },
        keep: { type: "number", label: tx("Messages to keep"), description: tx("Older ones are removed"), default: 3000, min: 100, max: 20000 },
    },
    async start({ store, cleanup }) {
        await awaitStorage(vault);
        const seen = new Set((vault.items ?? []).map(m => m.i));
        let pending: Indexed[] = [];
        // Written every half minute at most, so reading a busy chat doesn't mean constant writes
        const timer = setInterval(() => {
            if (!pending.length) return;
            vault.items = [...pending, ...(vault.items ?? [])].slice(0, store.keep);
            pending = [];
        }, 30_000);
        const index = (m: any) => {
            if (!m?.id || !m.content || seen.has(m.id)) return;
            const guild = getChannel(m.channel_id)?.guild_id;
            if (guild ? !store.indexServers : !store.indexDirectMessages) return;
            seen.add(m.id);
            pending.push({ i: m.id, c: m.channel_id, a: m.author?.id, n: m.author?.global_name ?? m.author?.username ?? "?", t: Date.parse(m.timestamp) || Date.now(), x: m.content.slice(0, 500) });
        };
        cleanup(
            () => {
                clearInterval(timer);
                if (pending.length) vault.items = [...pending, ...(vault.items ?? [])].slice(0, store.keep);
            },
            subscribe("MESSAGE_CREATE", ({ message }) => index(message)),
            subscribe("LOAD_MESSAGES_SUCCESS", ({ messages }) => (messages ?? []).forEach(index)),
            command({
                name: "vault",
                description: tx("Search the messages you have read (only you see the results)"),
                options: [
                    { name: "text", description: tx("Words to look for"), required: true },
                    { name: "from", description: tx("Only messages from this person"), type: "user" },
                ],
                run: ({ text, from }, ctx) => {
                    const words = String(text).toLowerCase().split(/\s+/).filter(Boolean);
                    const results = [...pending, ...(vault.items ?? [])]
                        .filter(m => (!from || m.a === from) && words.every(w => m.x.toLowerCase().includes(w)))
                        .slice(0, 15);
                    botMessage(ctx.channel.id, results.length
                        ? results.map(m => `**${m.n}** <t:${Math.floor(m.t / 1000)}:R>: ${preview(m.x, 120)}\n${messageLink(m.c, m.i)}`).join("\n")
                        : t("Nothing found for \"{text}\".", { text }));
                },
            }),
        );
    },
});

// CustomReactionButtons ------------------------------------------------------------------------------------------------

const CustomReactionButtons = definePlugin({
    id: "endcord.custom-reaction-buttons",
    name: "CustomReactionButtons",
    description: tx("Add your own one-tap reactions to the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Emotes", "Chat"],
    settings: {
        emojis: { type: "string", label: tx("Emojis"), description: tx("Separated by spaces; custom emojis are written as <:name:id>"), default: "👍 😂 ❤️" },
    },
    start({ store, cleanup }) {
        let removers: Array<() => void> = [];
        const register = () => {
            removers.forEach(r => r());
            removers = store.emojis.split(/\s+/).filter(Boolean).slice(0, 8).map((text, i) => {
                const emoji = parseEmoji(text)!;
                return addMessageAction({
                    key: `custom-reaction-${i}`,
                    icon: "ReactionIcon",
                    label: () => t("React with {emoji}", { emoji: emoji.id ? `:${emoji.name}:` : emoji.name }),
                    onPress: message => void Promise.resolve(react(message.channel_id, message.id, emoji)).catch(() => showToast(t("Couldn't react with that emoji"), findAssetId("CircleXIcon-primary"))),
                });
            });
        };
        register();
        cleanup(() => removers.forEach(r => r()), onSettingChange(store, register));
    },
});

// EncryptedMessage / InvisibleChat -------------------------------------------------------------------------------------

const SEALED = /🔐 ([A-Za-z0-9+/]{16,}={0,2})/;

function revealPrompt(title: string, unlock: (password: string) => string | undefined) {
    prompt({
        title,
        placeholder: t("Password"),
        confirm: t("Reveal"),
        onSubmit: password => {
            const text = unlock(password);
            if (text === undefined) throw new Error(t("Wrong password"));
            setTimeout(() => showText(title, text), 300);
        },
    });
}

const EncryptedMessage = definePlugin({
    id: "endcord.encrypted-message",
    name: "EncryptedMessage",
    description: tx("Send messages encrypted with a password with /encrypt; only people with the password can read them"),
    authors: [ENDCORD_AUTHOR],
    icon: "LockIcon",
    tags: ["Privacy", "Chat"],
    settings: {
        password: { type: "string", label: tx("Saved password"), description: tx("Messages encrypted with it are shown decrypted under them; leave empty to always ask"), default: "" },
    },
    start({ store, cleanup }) {
        const decrypt = (content: string, password: string) => {
            const match = content.match(SEALED);
            return match ? open(fromBase64(match[1]), password) : undefined;
        };
        cleanup(
            command({
                name: "encrypt",
                description: tx("Send an encrypted message"),
                options: [
                    { name: "message", description: tx("What to encrypt"), required: true },
                    { name: "password", description: tx("The password; leave it out to use your saved one") },
                ],
                run: ({ message, password }, ctx) => {
                    const key = String(password ?? store.password);
                    if (!key) {
                        botMessage(ctx.channel.id, t("Give a password or save one in the plugin's settings."));
                        return;
                    }
                    return `🔐 ${toBase64(seal(String(message), key))}`;
                },
            }),
            addMessageAction({
                key: "encrypted-message",
                icon: "LockIcon",
                label: () => t("Decrypt"),
                visible: message => SEALED.test(message.content ?? ""),
                onPress: message => revealPrompt(t("Decrypted Message"), password => decrypt(message.content, password)),
            }),
            onMessageRow("encrypted-message", (row, message) => {
                if (!store.password || !Array.isArray(row.content) || !SEALED.test(message.content ?? "")) return;
                const text = decrypt(message.content, store.password);
                if (text !== undefined) row.content = [...row.content, textNode(`\n🔓 ${text}`)];
            }),
        );
    },
});

// Invisible characters, built with fromCharCode so the source stays readable
const ZW = [0x200B, 0x200C, 0x200D, 0x2062].map(c => String.fromCharCode(c));
export const INVISIBLE_MARKER = String.fromCharCode(0x2063, 0x2063);

function hide(bytes: Uint8Array) {
    let out = INVISIBLE_MARKER;
    for (const b of bytes) out += ZW[b >> 6] + ZW[b >> 4 & 3] + ZW[b >> 2 & 3] + ZW[b & 3];
    return out;
}

function unhide(content: string): Uint8Array | undefined {
    const start = content.indexOf(INVISIBLE_MARKER);
    if (start === -1) return;
    const digits = [...content.slice(start + INVISIBLE_MARKER.length)].map(c => ZW.indexOf(c)).filter(d => d !== -1);
    const bytes = new Uint8Array(Math.floor(digits.length / 4));
    for (let i = 0; i < bytes.length; i++) bytes[i] = digits[i * 4] << 6 | digits[i * 4 + 1] << 4 | digits[i * 4 + 2] << 2 | digits[i * 4 + 3];
    return bytes;
}

const InvisibleChat = definePlugin({
    id: "endcord.invisible-chat",
    name: "InvisibleChat",
    description: tx("Hide a secret, password-protected message inside an ordinary one with /invisible"),
    authors: [ENDCORD_AUTHOR],
    icon: "EyeSlashIcon",
    tags: ["Privacy", "Fun"],
    settings: {
        password: { type: "string", label: tx("Saved password"), description: tx("Hidden messages with it are shown under their message; leave empty to always ask"), default: "" },
    },
    start({ store, cleanup }) {
        const reveal = (content: string, password: string) => {
            const bytes = unhide(content);
            return bytes ? open(bytes, password) : undefined;
        };
        cleanup(
            command({
                name: "invisible",
                description: tx("Send a message with a hidden secret inside"),
                options: [
                    { name: "cover", description: tx("The message everyone sees"), required: true },
                    { name: "secret", description: tx("The hidden message"), required: true },
                    { name: "password", description: tx("The password; leave it out to use your saved one") },
                ],
                run: ({ cover, secret, password }, ctx) => {
                    const key = String(password ?? store.password);
                    if (!key) {
                        botMessage(ctx.channel.id, t("Give a password or save one in the plugin's settings."));
                        return;
                    }
                    return `${cover}${hide(seal(String(secret), key))}`;
                },
            }),
            addMessageAction({
                key: "invisible-chat",
                icon: "EyeIcon",
                label: () => t("Reveal Hidden Message"),
                visible: message => (message.content ?? "").includes(INVISIBLE_MARKER),
                onPress: message => revealPrompt(t("Hidden Message"), password => reveal(message.content, password)),
            }),
            onMessageRow("invisible-chat", (row, message) => {
                if (!store.password || !Array.isArray(row.content) || !(message.content ?? "").includes(INVISIBLE_MARKER)) return;
                const text = reveal(message.content, store.password);
                if (text !== undefined) row.content = [...row.content, textNode(`\n🔓 ${text}`)];
            }),
        );
    },
});

// Translate+ -----------------------------------------------------------------------------------------------------------

const mapLetters = (text: string, upper: number, lower: number, digits?: number) => [...text].map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(upper + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(lower + code - 97);
    if (digits != null && code >= 48 && code <= 57) return String.fromCodePoint(digits + code - 48);
    return c;
}).join("");

const SMALL_CAPS = "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ";
const FLIPPED: Record<string, string> = Object.fromEntries([..."abcdefghijklmnopqrstuvwxyz.,!?'"].map((c, i) => [c, [..."ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz˙'¡¿,"][i]]));
const PIRATE: Array<[RegExp, string]> = [["hello", "ahoy"], ["hi", "ahoy"], ["my", "me"], ["friend", "matey"], ["friends", "hearties"], ["yes", "aye"], ["is", "be"], ["are", "be"], ["you", "ye"], ["your", "yer"], ["the", "th'"], ["money", "doubloons"], ["stop", "avast"], ["wow", "shiver me timbers"]]
    .map(([from, to]) => [new RegExp(`\\b${from}\\b`, "gi"), to]);

export const STYLES: Record<string, (text: string) => string> = {
    smallcaps: text => [...text.toLowerCase()].map(c => c >= "a" && c <= "z" ? SMALL_CAPS[c.charCodeAt(0) - 97] : c).join(""),
    upsidedown: text => [...text.toLowerCase()].map(c => FLIPPED[c] ?? c).reverse().join(""),
    bubble: text => mapLetters(text, 0x24B6, 0x24D0),
    fraktur: text => mapLetters(text, 0x1D56C, 0x1D586),
    script: text => mapLetters(text, 0x1D4D0, 0x1D4EA),
    doublestruck: text => mapLetters(text, 0x1D538, 0x1D552, 0x1D7D8),
    monospace: text => mapLetters(text, 0x1D670, 0x1D68A, 0x1D7F6),
    zalgo: text => [...text].map(c => c.trim() ? c + Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => String.fromCharCode(0x300 + Math.floor(Math.random() * 0x6F))).join("") : c).join(""),
    pirate: text => PIRATE.reduce((s, [re, to]) => s.replace(re, to), text) + " arr!",
};

const TranslatePlus = definePlugin({
    id: "endcord.translate-plus",
    name: "Translate+",
    description: tx("Endcord's translate plugin but with support for artistic languages!"),
    authors: [ENDCORD_AUTHOR],
    icon: "LanguageIcon",
    tags: ["Fun", "Chat"],
    start({ cleanup }) {
        cleanup(command({
            name: "translateplus",
            description: tx("Rewrite your text in a fun style"),
            options: [
                { name: "style", description: tx("The style"), required: true, choices: Object.keys(STYLES).map(name => ({ name, value: name })) },
                { name: "text", description: tx("Your message"), required: true },
            ],
            run: ({ style, text }) => (STYLES[style] ?? (s => s))(String(text)),
        }));
    },
});

// FakeDM ---------------------------------------------------------------------------------------------------------------

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

const FakeDM = definePlugin({
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
                    const fake: Fake = { id: String(Math.floor((Date.now() - 1420070400000) * 4194304)), authorId: user, content: String(message), at: Date.now() };
                    fakes.channels = { ...(fakes.channels ?? {}), [ctx.channel.id]: [...(fakes.channels?.[ctx.channel.id] ?? []), fake] };
                    injectFakes(ctx.channel.id);
                },
            }),
        );
    },
});

export default [
    MessageLinkEmbeds, RevealAllSpoilers, WhitelistedEmojis, Quoter, SedEnhanced, GifPaste, TenorGifFix, DontRoundMyTimestamps,
    MessageLoggerEnhanced, MessageVault, CustomReactionButtons, EncryptedMessage, InvisibleChat, TranslatePlus, FakeDM,
];
