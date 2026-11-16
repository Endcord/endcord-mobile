/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * TriviaAI's request, made as Endcord PC makes it: the message (and the ones before it, when asked) as an OpenAI-style
 * chat, with what its embeds say and its pictures' links. Everything in it is other people's text, so each part is
 * held to a length.
 */

export interface TextPart { type: "text"; text: string; }
export interface ImagePart { type: "image_url"; image_url: { url: string; }; }
export type Content = string | Array<TextPart | ImagePart>;
export interface ChatMessage { role: "user" | "assistant" | "system"; content: Content; }

export interface PayloadOptions {
    myId?: string;
    supportImages: boolean;
    passMessageAuthorName: boolean;
    treatSelfAsAssistant: boolean;
}

const MAX_CONTENT = 4000;
const MAX_EMBED_PART = 1000;
const MAX_IMAGES = 4;
const MAX_URL = 2048;

const clip = (text: unknown, max: number) => typeof text === "string" ? text.slice(0, max) : "";

const isImageAttachment = (a: any) => typeof a?.content_type === "string" && a.content_type.startsWith("image/");

/** Whether a message has anything to answer: text, an embed, or a picture when pictures are sent */
export function hasContent(message: any, supportImages: boolean): boolean {
    if (typeof message?.content === "string" && message.content.trim()) return true;
    if (Array.isArray(message?.embeds) && message.embeds.length) return true;
    return supportImages && Array.isArray(message?.attachments) && message.attachments.some(isImageAttachment);
}

/** What a message says, with its embeds' text, and its pictures' links when they're sent: PC's parseMessageContent */
export function messageContent(message: any, supportImages: boolean): Content | null {
    const textParts: string[] = [];
    const content = clip(message?.content, MAX_CONTENT);
    if (content.trim()) textParts.push(content);

    const embeds: any[] = Array.isArray(message?.embeds) ? message.embeds.slice(0, 10) : [];
    for (const embed of embeds) {
        const part = (text: unknown, wrap: (s: string) => string) => {
            const value = clip(text, MAX_EMBED_PART);
            return value ? wrap(value) : null;
        };
        const fields: any[] = Array.isArray(embed?.fields) ? embed.fields.slice(0, 25) : [];
        const lines = [
            part(embed?.provider?.name, s => `> ${s}`),
            part(embed?.author?.name, s => `**${s}**`),
            part(embed?.rawTitle ?? embed?.title, s => `## ${s}`),
            part(embed?.rawDescription ?? embed?.description, s => s),
            ...fields.map(f => {
                const name = clip(f?.rawName ?? f?.name, MAX_EMBED_PART), value = clip(f?.rawValue ?? f?.value, MAX_EMBED_PART);
                return name && value ? `**${name}**: ${value}` : null;
            }),
            part(embed?.footer?.text, s => `_${s}_`),
        ].filter((line): line is string => !!line);
        if (lines.length) textParts.push(lines.join("\n"));
    }

    const text = textParts.join("\n\n");
    if (!supportImages) return text || null;

    const images = new Set<string>();
    const add = (url: unknown) => {
        if (typeof url === "string" && /^https:\/\//i.test(url) && url.length <= MAX_URL && images.size < MAX_IMAGES) images.add(url);
    };
    for (const a of Array.isArray(message?.attachments) ? message.attachments : []) if (isImageAttachment(a)) add(a.proxy_url ?? a.url);
    for (const embed of embeds) {
        add(embed?.image?.url);
        add(embed?.thumbnail?.url);
        for (const image of Array.isArray(embed?.images) ? embed.images : []) add(image?.url);
    }
    if (!images.size) return text || null;
    return [
        ...text ? [{ type: "text" as const, text }] : [],
        ...[...images].map(url => ({ type: "image_url" as const, image_url: { url } })),
    ];
}

/** The messages before [target] in a chat's loaded ones (oldest first), as many as asked */
export function previousMessages(loaded: any[], target: any, count: number): any[] {
    if (!Array.isArray(loaded) || count <= 0) return [];
    const index = loaded.findIndex(m => m?.id === target?.id);
    if (index <= 0) return [];
    return loaded.slice(Math.max(0, index - count), index);
}

/** The chat for the AI, as PC builds it: whose message each is, and the author's name in front where asked */
export function buildChat(messages: any[], target: any, options: PayloadOptions): ChatMessage[] {
    const chat: ChatMessage[] = [];
    for (const message of messages) {
        const parsed = messageContent(message, options.supportImages);
        if (!parsed) continue;
        const own = !!options.myId && message?.author?.id === options.myId;
        const role = own && message?.id !== target?.id && options.treatSelfAsAssistant ? "assistant" : "user";
        let content = parsed;
        if (!own && options.passMessageAuthorName) {
            const prefix = `${clip(message?.author?.username, 64) || "Unknown"}: `;
            if (typeof parsed === "string") content = prefix + parsed;
            else {
                const at = parsed.findIndex(p => p.type === "text");
                content = at === -1
                    ? [{ type: "text", text: prefix }, ...parsed]
                    : parsed.map((p, i) => i === at ? { type: "text", text: prefix + (p as TextPart).text } : p);
            }
        }
        chat.push({ role, content });
    }
    return chat;
}

/** PC's system prompt, with who you are and when it is put in */
export function systemPrompt(template: string, user: string, now: Date) {
    return template.replace(/\{current_user\}/g, user).replace(/\{current_time\}/g, now.toString());
}

/** The answer's text from an OpenAI-style reply, whether its content is text or a list of parts */
export function answerOf(data: any): string {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) return content.map(p => typeof p?.text === "string" ? p.text : "").join("").trim();
    return "";
}

/** Whether a picture may be downloaded to send it inside the request: only Discord's own, never anything else */
export function isDiscordImage(url: string): boolean {
    return /^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net)\//i.test(url);
}
