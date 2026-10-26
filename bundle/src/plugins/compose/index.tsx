/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's plugins that change a message as you send it. They all run through onSend, in a fixed order: text
 * rewrites first, then formatting, then the signature, so they combine the same way every time.
 */

import { t, tx } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore, subscribe } from "../common";
import { appendToTimestamp, botMessage, command, deleteMessage, edit, generatedIcon, getChannel, loadedMessages, nativeColor, onMessageRow, onSend, outsideCode, parseEmoji, react, redrawMessage } from "../hooks";
import { SlashedIcon } from "../silentTyping";
import TextReplaceRules, { applyRules } from "./TextReplaceRules";

const chatButtonSetting = {
    type: "select" as const,
    label: tx("Chat bar button"),
    default: "none",
    options: [
        { label: tx("Hidden"), value: "none" },
        { label: tx("Left of the message box"), value: "left" },
        { label: tx("Right of the message box"), value: "right" },
    ],
};

export const toFullwidth = (text: string) => text.replace(/[ -~]/g, c => c === " " ? "\u3000" : String.fromCharCode(c.charCodeAt(0) + 0xFEE0));

const AutoVaporwave = definePlugin({
    id: "endcord.auto-vaporwave",
    name: "AutoVaporwave",
    description: tx("Turn every message you send into ｆｕｌｌｗｉｄｔｈ text automatically."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(onSend("auto-vaporwave", (content, { editing }) => editing ? undefined : outsideCode(content, toFullwidth), 20));
    },
});

const TalkInReverse = definePlugin({
    id: "endcord.talk-in-reverse",
    name: "TalkInReverse",
    description: tx("Reverses the message content before sending it."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(onSend("talk-in-reverse", content => [...content].reverse().join(""), 30));
    },
});

/** Capitalises the first letter of every sentence, leaving words in `blocked` alone */
export function capitalizeSentences(text: string, blocked: string[]) {
    return text.split(/([.!?]+['")\]]*\s+|\n+)/).map((part, i) => {
        if (i % 2 === 1 || !part) return part;
        const lower = part.toLowerCase();
        if (blocked.some(word => word && lower.startsWith(word))) return part;
        return part.replace(/^(\s*)(\S)/, (_, space, first) => space + first.toUpperCase());
    }).join("");
}

const splitList = (text: string) => text.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);

const WriteUpperCase = definePlugin({
    id: "endcord.write-upper-case",
    name: "WriteUpperCase",
    description: tx("Changes the first Letter of each Sentence in Message Inputs to Uppercase"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        blockedWords: {
            type: "string",
            label: tx("Words to leave lowercase"),
            description: tx("Strings not to capitalise (separate with a comma)"),
            default: "http, https, ok",
        },
    },
    start({ store, cleanup }) {
        cleanup(onSend("write-upper-case", content => outsideCode(content, text => capitalizeSentences(text, splitList(store.blockedWords))), 10));
    },
});

// PolishWording: contractions get their apostrophes back (or are written out), sentences start with a capital and end
// with a period
const CONTRACTIONS: Record<string, string> = {
    "wasn't": "was not", "can't": "cannot", "don't": "do not", "won't": "will not", "isn't": "is not", "aren't": "are not",
    "haven't": "have not", "hasn't": "has not", "hadn't": "had not", "doesn't": "does not", "didn't": "did not",
    "shouldn't": "should not", "wouldn't": "would not", "couldn't": "could not", "that's": "that is", "what's": "what is",
    "there's": "there is", "how's": "how is", "where's": "where is", "when's": "when is", "who's": "who is", "why's": "why is",
    "you'll": "you will", "i'll": "I will", "they'll": "they will", "it'll": "it will", "i'm": "I am", "you're": "you are",
    "they're": "they are", "he's": "he is", "she's": "she is", "i've": "I have", "you've": "you have", "we've": "we have",
    "they've": "they have", "you'd": "you would", "he'd": "he would", "she'd": "she would", "it'd": "it would",
    "we'd": "we would", "they'd": "they would", "y'all": "you all", "here's": "here is",
};
// Without the ones that are real words too (were, well, hell, its, ...)
const MISSING_APOSTROPHE = Object.fromEntries(Object.keys(CONTRACTIONS).map(c => [c.replace(/'/g, ""), c]).filter(([w]) => !["its", "were", "well", "hell", "shell", "wed", "id", "hed", "shed", "whos", "cant", "wont"].includes(w)));

/** Gives `to` the capitalisation `from` had, letter by letter */
function keepCase(from: string, to: string) {
    const caps = [...from].filter(c => /[a-z]/i.test(c)).map(c => c === c.toUpperCase());
    let i = 0;
    return [...to].map(c => {
        if (!/[a-z]/i.test(c)) return c;
        const upper = caps[Math.min(i++, caps.length - 1)];
        return upper ? c.toUpperCase() : c.toLowerCase();
    }).join("");
}

function wordsRegex(words: string[]) {
    return new RegExp(`\\b(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
}
const MISSING_RE = wordsRegex(Object.keys(MISSING_APOSTROPHE));
const CONTRACTION_RE = wordsRegex(Object.keys(CONTRACTIONS));

const PolishWording = definePlugin({
    id: "endcord.polish-wording",
    name: "PolishWording",
    description: tx("Tweaks your messages to make them look nicer and have better grammar. See settings"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        fixApostrophes: { type: "boolean", label: tx("Fix apostrophes"), description: tx("Ensure contractions contain apostrophes."), default: true },
        expandContractions: { type: "boolean", label: tx("Expand contractions"), description: tx("Expand contractions."), default: false },
        fixCapitalization: { type: "boolean", label: tx("Fix capitalization"), description: tx("Capitalize sentences."), default: false },
        fixPunctuation: { type: "boolean", label: tx("Fix punctuation"), description: tx("Punctate sentences."), default: false },
        blockedWords: {
            type: "string",
            label: tx("Words to leave lowercase"),
            description: tx("Words that will not be capitalized (comma separated)."),
            default: "",
        },
    },
    start({ store, cleanup }) {
        cleanup(onSend("polish-wording", content => outsideCode(content, text => {
            if (store.fixApostrophes || store.expandContractions) text = text.replace(MISSING_RE, m => keepCase(m, MISSING_APOSTROPHE[m.toLowerCase()] ?? m));
            if (store.expandContractions) text = text.replace(CONTRACTION_RE, m => keepCase(m, CONTRACTIONS[m.toLowerCase()] ?? m));
            if (store.fixCapitalization) text = capitalizeSentences(text, splitList(store.blockedWords));
            if (store.fixPunctuation) text = text.replace(/([a-z0-9])(\s*)$/i, "$1.$2");
            return text;
        }), 11));
    },
});

/** Removes the shortest indentation from every line of each code block */
export function unindentCodeBlocks(content: string) {
    return content.replace(/```[\s\S]*?```/g, block => {
        const lines = block.split("\n");
        if (lines.length < 2) return block;
        const suffix = lines[lines.length - 1] === "```" ? lines.pop()! : "";
        const body = lines.slice(1).join("\n").replace(/\t/g, "    ");
        const indent = Math.min(...(body.match(/^ *(?=\S)/gm) ?? [""]).map(s => s.length));
        const trimmed = indent > 0 && Number.isFinite(indent) ? body.replace(new RegExp(`^ {${indent}}`, "gm"), "") : body;
        return `${lines[0]}\n${trimmed}\n${suffix}`;
    });
}

const Unindent = definePlugin({
    id: "endcord.unindent",
    name: "Unindent",
    description: tx("Trims leading indentation from codeblocks"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat", "Utility"],
    start({ cleanup }) {
        cleanup(onSend("unindent", content => content.includes("```") ? unindentCodeBlocks(content) : undefined, 15));
    },
});

const INVISIBLE = /[\u200B-\u200D\u200E\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF\u00AD]/g;

const ZeroWidthSanitizer = definePlugin({
    id: "endcord.zero-width-sanitizer",
    name: "ZeroWidthSanitizer",
    description: tx("Removes invisible zero-width characters from messages to prevent fingerprinting and tracking"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShieldIcon",
    tags: ["Privacy"],
    settings: {
        sanitizeOutgoing: { type: "boolean", label: tx("Clean your messages"), description: tx("Sanitize outgoing messages (before sending)"), default: true },
        sanitizeEdits: { type: "boolean", label: tx("Clean your edits"), description: tx("Sanitize edited messages too"), default: true },
        showToastOnDetection: { type: "boolean", label: tx("Tell me when something was removed"), description: tx("Show a notification when invisible characters are removed"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onSend("zero-width-sanitizer", (content, { editing }) => {
            if (editing ? !store.sanitizeEdits : !store.sanitizeOutgoing) return;
            // A message InvisibleChat hid a secret in is sent as it is
            if (content.includes(String.fromCharCode(0x2063, 0x2063))) return;
            // Zero-width joiners hold emoji sequences (👨‍👩‍👧) together, so the ones after an emoji are kept
            const cleaned = content.replace(INVISIBLE, (c, i: number) => c === "\u200D" && i > 0 && content.charCodeAt(i - 1) >= 0x2000 ? c : "");
            if (cleaned !== content && store.showToastOnDetection) showToast(t("Removed invisible characters from your message"), findAssetId("ShieldIcon"));
            return cleaned;
        }, 90));
    },
});

const AtSomeone = definePlugin({
    id: "endcord.at-someone",
    name: "AtSomeone",
    description: tx("Mention a random member of the channel"),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(onSend("at-someone", (content, { channelId, editing }) => {
            if (editing || !/@someone\b/i.test(content)) return;
            const channel = getChannel(channelId);
            const me = currentUserId();
            let ids: string[];
            if (channel?.guild_id) {
                ids = (getStore("GuildMemberStore")?.getMemberIds?.(channel.guild_id) ?? []).filter((id: string) => id !== me);
            } else {
                ids = (channel?.recipients ?? []).filter((id: string) => id !== me);
            }
            if (!ids.length) return;
            return content.replace(/@someone\b/gi, () => `<@${ids[Math.floor(Math.random() * ids.length)]}>`);
        }, 5));
    },
});

const Signature = definePlugin({
    id: "endcord.signature",
    name: "Signature",
    description: tx("Automated fingerprint/end text"),
    authors: [ENDCORD_AUTHOR],
    icon: "PencilIcon",
    tags: ["Chat", "Customisation"],
    settings: {
        isEnabled: { type: "boolean", label: tx("Add my signature"), description: tx("Turn this off to stop adding it without turning the plugin off"), default: true },
        name: { type: "string", label: tx("Signature"), description: tx("The signature that will be added to the end of your messages"), default: "a chronic discord user" },
        textHeader: { type: "string", label: tx("Text before the signature"), description: tx("Shown before the signature, like > for a quote"), default: ">" },
        button: chatButtonSetting,
    },
    start({ store, cleanup }) {
        cleanup(
            onSend("signature", (content, { editing }) => {
                if (editing || !store.isEnabled || !store.name.trim() || !content.trim()) return;
                return `${content}\n${store.textHeader ? `${store.textHeader} ` : ""}${store.name}`;
            }, 80),
            command({
                name: "signature",
                description: tx("Turn your signature on or off"),
                options: [{ name: "value", description: tx("On or off (default: switch)"), type: "boolean" }],
                run: ({ value }, ctx) => {
                    store.isEnabled = value ?? !store.isEnabled;
                    botMessage(ctx.channel.id, store.isEnabled ? t("Signature enabled!") : t("Signature disabled!"));
                },
            }),
            addChatButton({
                key: "signature",
                side: () => store.button as "left" | "right" | "none",
                render: () => <ToggleButton store={Signature.store} field="isEnabled" icon="PencilIcon" label={t("Signature")} on={t("Signature enabled!")} off={t("Signature disabled!")} />,
            }),
        );
    },
});

/** A chat bar button that switches a boolean setting, with a line through its icon when it's off */
function ToggleButton({ store, field, icon, label, on, off, slashWhenOn }: { store: any; field: string; icon: string; label: string; on: string; off: string; slashWhenOn?: boolean; }) {
    const values = useProxy(store);
    const Button = getChatInputActionButton();
    const Icon = generatedIcon(icon);
    if (!Button || !Icon) return null;
    const enabled = !!values[field];
    const slashed = slashWhenOn ? enabled : !enabled;
    return <Button
        accessibilityLabel={label}
        accessibilityState={{ checked: enabled }}
        IconComponent={slashed ? (props: any) => <SlashedIcon Icon={Icon} {...props} /> : Icon}
        onPress={() => {
            store[field] = !store[field];
            showToast(store[field] ? on : off, findAssetId(icon));
        }}
    />;
}

const SUPPRESS_NOTIFICATIONS = 1 << 12;

const SilentMessageToggle = definePlugin({
    id: "endcord.silent-message-toggle",
    name: "SilentMessageToggle",
    description: tx("Adds a button to the chat bar to toggle sending a silent message."),
    authors: [ENDCORD_AUTHOR],
    icon: "BellSlashIcon",
    tags: ["Chat", "Notifications"],
    settings: {
        enabled: { type: "boolean", label: tx("Send silently"), description: tx("Your messages don't send push notifications"), default: false },
        autoDisable: { type: "boolean", label: tx("Turn off after one message"), description: tx("Automatically disable the silent message toggle again after sending one"), default: true },
        button: { ...chatButtonSetting, default: "left" },
    },
    start({ store, cleanup }) {
        cleanup(
            onSend("silent-message", (_, { editing, options }) => {
                if (editing || !store.enabled || !options) return;
                options.flags = (options.flags ?? 0) | SUPPRESS_NOTIFICATIONS;
                if (store.autoDisable) store.enabled = false;
            }, 95),
            addChatButton({
                key: "silent-message",
                side: () => store.button as "left" | "right" | "none",
                render: () => <ToggleButton store={SilentMessageToggle.store} field="enabled" icon="BellIcon" slashWhenOn label={t("Send silently")} on={t("Silent messages are on")} off={t("Silent messages are off")} />,
            }),
        );
    },
});

const NoReplyMention = definePlugin({
    id: "endcord.no-reply-mention",
    name: "NoReplyMention",
    description: tx("Disables reply pings by default"),
    authors: [ENDCORD_AUTHOR],
    icon: "AtIcon",
    tags: ["Chat"],
    settings: {
        userList: {
            type: "string",
            label: tx("Exceptions"),
            description: tx("User IDs (comma separated) treated the other way round"),
            default: "",
        },
        shouldPingListed: {
            type: "boolean",
            label: tx("Ping the users in the list"),
            description: tx("On: replies to them ping and others don't. Off: replies to them don't ping and others do."),
            default: true,
        },
    },
    start({ store, cleanup }) {
        const actions = findByProps("createPendingReply");
        if (typeof actions?.createPendingReply !== "function") throw new Error("Discord's reply actions weren't found");
        cleanup(before("createPendingReply", actions, ([reply]: any[]) => {
            if (!reply || typeof reply !== "object") return;
            const listed = splitList(store.userList).includes(reply.message?.author?.id);
            reply.shouldMention = listed ? store.shouldPingListed : !store.shouldPingListed;
        }));
    },
});

const NormalizeMessageLinks = definePlugin({
    id: "endcord.normalize-message-links",
    name: "NormalizeMessageLinks",
    description: tx("Strip canary/ptb from message links"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Chat", "Utility"],
    start({ cleanup }) {
        cleanup(onSend("normalize-message-links", content => content.replace(/https:\/\/(?:canary\.|ptb\.)discord(?:app)?\.com\/channels\//g, "https://discord.com/channels/"), 50));
    },
});

const EMBED_HOSTS: Array<[RegExp, string]> = [
    [/^https:\/\/(?:www\.|vt\.)?tiktok\.com/i, "https://www.tnktok.com"],
    [/^https:\/\/(?:www\.)?(?:x|twitter)\.com/i, "https://www.fxtwitter.com"],
    [/^https:\/\/(?:www\.)?instagram\.com/i, "https://www.kkinstagram.com"],
];

const EmbeddedURLs = definePlugin({
    id: "endcord.embedded-urls",
    name: "EmbeddedURLs",
    description: tx("Turns plain social links into embeddable URLs so posts and videos are fully viewable in Discord instead of forcing users to open the external site."),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        cleanup(onSend("embedded-urls", content => content.replace(/https:\/\/[^\s<>]+/g, url => {
            for (const [host, replacement] of EMBED_HOSTS) if (host.test(url)) return url.replace(host, replacement);
            return url;
        }), 51));
    },
});

const BetterPlusReacts = definePlugin({
    id: "endcord.better-plus-reacts",
    name: "BetterPlusReacts",
    description: tx("React to an earlier message by typing +:emoji:, with one + per message back"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Chat", "Emotes"],
    start({ cleanup }) {
        cleanup(onSend("better-plus-reacts", (content, { channelId, editing }) => {
            const match = !editing && content.trim().match(/^(\++)(\S+)$/u);
            if (!match) return;
            const emoji = parseEmoji(match[2]);
            if (!emoji || /^[\w:]+$/.test(emoji.name) && !emoji.id) return;
            const messages = loadedMessages(channelId);
            const target = messages[messages.length - match[1].length];
            if (!target) return;
            react(channelId, target.id, emoji);
            return null;
        }, -10));
    },
});

const MessageBurst = definePlugin({
    id: "endcord.message-burst",
    name: "MessageBurst",
    description: tx("Merges messages sent within a time period with your previous sent message if no one else sends a message before you."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat"],
    settings: {
        timePeriod: { type: "number", label: tx("Burst length (seconds)"), description: tx("The duration of bursts (in seconds)."), default: 3, min: 1, max: 60 },
        useSpace: { type: "boolean", label: tx("Join with a space"), description: tx("Join the messages with a space instead of a new line"), default: false },
        shouldMergeWithAttachment: { type: "boolean", label: tx("Merge with attachments"), description: tx("Should the message be merged if the last message has an attachment?"), default: false },
    },
    start({ store, cleanup }) {
        cleanup(onSend("message-burst", (content, { channelId, editing, options }) => {
            if (editing || options?.messageReference || !content.trim()) return;
            const last = loadedMessages(channelId).at(-1);
            if (!last || last.author?.id !== currentUserId() || last.state !== "SENT") return;
            if (!store.shouldMergeWithAttachment && last.attachments?.length) return;
            const sentAt = typeof last.timestamp?.valueOf === "function" ? last.timestamp.valueOf() : Date.parse(last.timestamp);
            if (!(Date.now() - sentAt <= store.timePeriod * 1000)) return;
            const merged = `${last.content}${store.useSpace ? " " : "\n"}${content}`;
            if (merged.length > 2000) return;
            edit(channelId, last.id, merged);
            return null;
        }, 100));
    },
});

const SelfDestruct = definePlugin({
    id: "endcord.self-destruct",
    name: "SelfDestruct",
    description: tx("Sends messages that are automatically deleted after a configurable delay. Red timer visible on each message."),
    authors: [ENDCORD_AUTHOR],
    icon: "TimerIcon",
    tags: ["Chat", "Privacy"],
    settings: {
        active: { type: "boolean", label: tx("Self-destruct my messages"), description: tx("SelfDestruct active (toggle in chat bar)"), default: false },
        delay: { type: "number", label: tx("Delay (seconds)"), description: tx("Delay before deletion (seconds)"), default: 30, min: 3, max: 86400 },
        button: { ...chatButtonSetting, default: "left" },
    },
    start({ store, cleanup }) {
        const timers = new Set<ReturnType<typeof setTimeout>>();
        // Messages sent while it's on, until the server sends them back with an ID
        let pending: Array<{ channelId: string; content: string; at: number; }> = [];
        // Message ID to when it will be deleted
        const doomed = new Map<string, number>();
        const red = nativeColor("#F23F43");
        cleanup(
            () => timers.forEach(clearTimeout),
            onSend("self-destruct", (content, { channelId, editing }) => {
                if (editing || !store.active) return;
                pending = [...pending.filter(p => Date.now() - p.at < 60_000), { channelId, content, at: Date.now() }];
            }, 99),
            subscribe("MESSAGE_CREATE", ({ message }) => {
                if (!message || message.author?.id !== currentUserId()) return;
                const index = pending.findIndex(p => p.channelId === message.channel_id && p.content.trim() === String(message.content ?? "").trim());
                if (index === -1) return;
                pending.splice(index, 1);
                const at = Date.now() + store.delay * 1000;
                doomed.set(message.id, at);
                redrawMessage(message.channel_id, message.id);
                const timer = setTimeout(() => {
                    timers.delete(timer);
                    doomed.delete(message.id);
                    deleteMessage(message.channel_id, message.id);
                }, at - Date.now());
                timers.add(timer);
            }),
            onMessageRow("self-destruct", (row, message) => {
                const at = doomed.get(message.id);
                if (!at) return;
                if (red !== undefined) row.timestampColor = red;
                appendToTimestamp(row, ` · 💣 ${new Date(at).toLocaleTimeString()}`);
            }),
            addChatButton({
                key: "self-destruct",
                side: () => store.button as "left" | "right" | "none",
                render: () => <ToggleButton store={SelfDestruct.store} field="active" icon="TimerIcon" slashWhenOn={false} label={t("Self-destruct my messages")} on={t("Your messages will self-destruct")} off={t("Self-destruct is off")} />,
            }),
        );
    },
});

const AnonymiseFileNames = definePlugin({
    id: "endcord.anonymise-file-names",
    name: "AnonymiseFileNames",
    description: tx("Anonymise uploaded file names"),
    authors: [ENDCORD_AUTHOR],
    icon: "AttachmentIcon",
    tags: ["Privacy", "Media"],
    settings: {
        method: {
            type: "select",
            label: tx("New file names"),
            default: "random",
            options: [
                { label: tx("Random characters"), value: "random" },
                { label: tx("Upload time"), value: "timestamp" },
                { label: tx("Fixed name"), value: "fixed" },
            ],
        },
        randomisedLength: { type: "number", label: tx("Random name length"), description: tx("How many characters random names have"), default: 7, min: 3, max: 64 },
        fixedName: { type: "string", label: tx("Fixed name"), description: tx("The name used when the fixed name is chosen"), default: "image" },
    },
    start({ store, cleanup }) {
        const module = findByProps("CloudUpload");
        if (typeof module?.CloudUpload !== "function") throw new Error("Discord's uploader wasn't found");
        const newName = () => {
            if (store.method === "timestamp") return String(Date.now());
            if (store.method === "fixed") return store.fixedName.trim() || "image";
            const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
            return Array.from({ length: store.randomisedLength }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        };
        cleanup(before("CloudUpload", module, ([upload]: any[]) => {
            const file = upload?.file ?? upload;
            const name: unknown = file?.filename ?? file?.name;
            if (typeof name !== "string") return;
            const dot = name.lastIndexOf(".");
            const renamed = newName() + (dot > 0 ? name.slice(dot) : "");
            if (file.filename) file.filename = renamed;
            if (file.name) file.name = renamed;
        }));
    },
});

const TextReplace = definePlugin({
    id: "endcord.text-replace",
    name: "TextReplace",
    description: tx("Replace text in your messages. You can find pre-made rules in the #textreplace-rules channel in Endcord's Server"),
    authors: [ENDCORD_AUTHOR],
    icon: "PencilIcon",
    tags: ["Chat", "Utility"],
    SettingsComponent: TextReplaceRules,
    start({ cleanup }) {
        cleanup(onSend("text-replace", content => applyRules(content), 0));
    },
});

export default [
    AutoVaporwave, TalkInReverse, WriteUpperCase, PolishWording, Unindent, ZeroWidthSanitizer, AtSomeone, Signature,
    SilentMessageToggle, NoReplyMention, NormalizeMessageLinks, EmbeddedURLs, BetterPlusReacts, MessageBurst, SelfDestruct,
    AnonymiseFileNames, TextReplace,
];
