/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's file and media plugins: viewing documents and archives, keeping favourites, and better YouTube titles.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { safeFetch } from "@lib/utils";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { dispatchSoon, getStore } from "../common";
import { fromBase64, fromUtf8 } from "../crypto";
import { addMessageAction, botMessage, command, copy, currentChannelId, onIncomingMessage, openUrl, send, share } from "../hooks";
import { choose, prompt, showText } from "../ui/dialogs";
import LogList from "../ui/LogList";

const extension = (name?: string) => (name?.split(".").pop() ?? "").toLowerCase();
const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

function pick<T extends { filename?: string; }>(title: string, items: T[], then: (item: T) => void) {
    if (items.length === 1) then(items[0]);
    else choose(title, items.map(item => ({ label: item.filename ?? "?", value: item })), then);
}

// FileViewer / PdfViewer -----------------------------------------------------------------------------------------------

const OFFICE = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"]);

const FileViewer = definePlugin({
    id: "endcord.file-viewer",
    name: "FileViewer",
    description: tx("View Word, Excel and PowerPoint attachments without downloading them, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "FileIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        const files = (m: any): any[] => (m.attachments ?? []).filter((a: any) => OFFICE.has(extension(a.filename)));
        cleanup(addMessageAction({
            key: "file-viewer",
            icon: "FileIcon",
            label: () => t("View File"),
            visible: m => files(m).length > 0,
            onPress: m => pick(t("View File"), files(m), a => openUrl(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(a.url)}`)),
        }));
    },
});

const PdfViewer = definePlugin({
    id: "endcord.pdf-viewer",
    name: "PdfViewer",
    description: tx("Preview PDF attachments without downloading them first, from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "FileIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        const files = (m: any): any[] => (m.attachments ?? []).filter((a: any) => extension(a.filename) === "pdf");
        cleanup(addMessageAction({
            key: "pdf-viewer",
            icon: "FileIcon",
            label: () => t("View PDF"),
            visible: m => files(m).length > 0,
            onPress: m => pick(t("View PDF"), files(m), a => openUrl(`https://docs.google.com/viewer?url=${encodeURIComponent(a.url)}`)),
        }));
    },
});

// ZipPreview -----------------------------------------------------------------------------------------------------------

/** A file's bytes; React Native's fetch can't give an ArrayBuffer, so it goes through a data URL */
async function bytesOf(url: string): Promise<Uint8Array> {
    const blob = await safeFetch(url).then(r => r.blob());
    const data: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
    return fromBase64(data.slice(data.indexOf(",") + 1));
}

/** Whether bytes are well-formed UTF-8 (plain ASCII included) */
function isUtf8(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        const extra = b < 0x80 ? 0 : b >> 5 === 6 ? 1 : b >> 4 === 14 ? 2 : b >> 3 === 30 ? 3 : -1;
        if (extra < 0 || i + extra >= bytes.length + (extra ? 0 : 1)) return false;
        for (let j = 1; j <= extra; j++) if (bytes[i + j] >> 6 !== 2) return false;
        i += extra + 1;
    }
    return true;
}

/** The files in a ZIP archive, from its central directory */
export function zipEntries(bytes: Uint8Array): Array<{ name: string; size: number; }> {
    const u16 = (i: number) => bytes[i] | bytes[i + 1] << 8;
    const u32 = (i: number) => (bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16 | bytes[i + 3] << 24) >>> 0;
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (u32(i) === 0x06054b50) {
            end = i;
            break;
        }
    }
    if (end === -1) throw new Error("Not a ZIP file");
    const count = u16(end + 10);
    let offset = u32(end + 16);
    const entries: Array<{ name: string; size: number; }> = [];
    for (let i = 0; i < count && u32(offset) === 0x02014b50; i++) {
        const nameLength = u16(offset + 28), extraLength = u16(offset + 30), commentLength = u16(offset + 32);
        const raw = bytes.subarray(offset + 46, offset + 46 + nameLength);
        // Flag bit 11 marks a UTF-8 name, but many tools write UTF-8 without setting it; anything else is read byte by byte
        const name = u16(offset + 8) & 0x800 || isUtf8(raw) ? fromUtf8(raw) : String.fromCharCode(...raw);
        entries.push({ name, size: u32(offset + 24) });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

const ZipPreview = definePlugin({
    id: "endcord.zip-preview",
    name: "ZipPreview",
    description: tx("Previews ZIP contents inside file attachments."),
    authors: [ENDCORD_AUTHOR],
    icon: "FileIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        const zips = (m: any): any[] => (m.attachments ?? []).filter((a: any) => extension(a.filename) === "zip");
        cleanup(addMessageAction({
            key: "zip-preview",
            icon: "FileIcon",
            label: () => t("View ZIP Contents"),
            visible: m => zips(m).length > 0,
            onPress: m => pick(t("View ZIP Contents"), zips(m), async a => {
                if (a.size > 25 * 1048576) {
                    showToast(t("This file is too big to look into"), findAssetId("CircleXIcon-primary"));
                    return;
                }
                try {
                    const entries = zipEntries(await bytesOf(a.url));
                    showText(a.filename, entries.map(e => e.name.endsWith("/") ? `📁 ${e.name}` : `${e.name} · ${size(e.size)}`).join("\n") || t("The archive is empty."));
                } catch {
                    showToast(t("Couldn't open this ZIP file"), findAssetId("CircleXIcon-primary"));
                }
            }),
        }));
    },
});

// FixFileExtensions ----------------------------------------------------------------------------------------------------

const RENAMES: Record<string, string> = { jfif: "jpg", jpe: "jpg", pjpeg: "jpg", pjp: "jpg", jpeg: "jpg", m4v: "mp4", qt: "mov", tif: "tiff" };

const FixFileExtensions = definePlugin({
    id: "endcord.fix-file-extensions",
    name: "FixFileExtensions",
    description: tx("Fixes file extensions by renaming them to a compatible supported format if possible"),
    authors: [ENDCORD_AUTHOR],
    icon: "AttachmentIcon",
    tags: ["Media"],
    start({ cleanup }) {
        const module = findByProps("CloudUpload");
        if (typeof module?.CloudUpload !== "function") throw new Error("Discord's uploader wasn't found");
        cleanup(before("CloudUpload", module, ([upload]: any[]) => {
            const file = upload?.file ?? upload;
            const name: unknown = file?.filename ?? file?.name;
            if (typeof name !== "string") return;
            const fixed = RENAMES[extension(name)];
            if (!fixed) return;
            const renamed = name.replace(/\.[^.]+$/, `.${fixed}`);
            if (file.filename) file.filename = renamed;
            if (file.name) file.name = renamed;
        }));
    },
});

// FavoriteAnything -----------------------------------------------------------------------------------------------------

interface Favorite {
    url: string;
    filename: string;
    at: number;
}

const favorites = wrapSync(createStorage<{ items: Favorite[]; }>(createMMKVBackend("ENDCORD_FAVORITE_MEDIA", { items: [] })));
const favoriteList = () => Array.isArray(favorites.items) ? favorites.items : [];

function FavoritesPage() {
    useProxy(favorites);
    return <LogList
        title={t("Favorites")}
        empty={t("Long-press a message with an attachment and choose Favorite")}
        entries={favoriteList().map(f => ({
            key: f.url,
            label: f.filename,
            subLabel: new Date(f.at).toLocaleDateString(),
            icon: "StarIcon",
            onPress: () => choose(f.filename, [
                { label: t("Send to This Chat"), value: "send", icon: "SendMessageIcon" },
                { label: t("Open"), value: "open", icon: "LinkExternalSmallIcon" },
                { label: t("Copy Link"), value: "copy", icon: "CopyIcon" },
                { label: t("Remove"), value: "remove", icon: "TrashIcon", danger: true },
            ], action => {
                const channelId = currentChannelId();
                if (action === "send" && channelId) send(channelId, f.url);
                else if (action === "open") openUrl(f.url);
                else if (action === "copy") copy(f.url);
                else if (action === "remove") favorites.items = favoriteList().filter(x => x.url !== f.url);
            }),
        }))}
    />;
}

const FavoriteAnything = definePlugin({
    id: "endcord.favorite-anything",
    name: "FavoriteAnything",
    description: tx("Favorite any image, video, or file attachment"),
    authors: [ENDCORD_AUTHOR],
    icon: "StarIcon",
    tags: ["Media"],
    SettingsComponent: FavoritesPage,
    async start({ cleanup }) {
        await awaitStorage(favorites);
        cleanup(addMessageAction({
            key: "favorite-anything",
            icon: "StarIcon",
            label: () => t("Favorite"),
            visible: m => (m.attachments?.length ?? 0) > 0,
            onPress: m => pick(t("Favorite"), m.attachments, (a: any) => {
                if (favoriteList().some(f => f.url === a.url)) return showToast(t("It's already a favorite"), findAssetId("StarIcon"));
                favorites.items = [{ url: a.url, filename: a.filename, at: Date.now() }, ...favoriteList()];
                showToast(t("Added to your favorites"), findAssetId("StarIcon"));
            }),
        }));
    },
});

// GifCollections -------------------------------------------------------------------------------------------------------

const collections = wrapSync(createStorage<{ sets: Record<string, string[]>; }>(createMMKVBackend("ENDCORD_GIF_COLLECTIONS", { sets: {} })));
const NEW_COLLECTION = "endcord:new";

const gifsIn = (m: any): string[] => [
    ...(m.attachments ?? []).filter((a: any) => extension(a.filename) === "gif").map((a: any) => a.url),
    ...(m.embeds ?? []).filter((e: any) => e.type === "gifv" || /tenor\.com|giphy\.com/.test(e.url ?? "")).map((e: any) => e.url),
    ...(String(m.content ?? "").match(/https?:\/\/\S+\.gif\b\S*/g) ?? []),
].filter(Boolean);

function addToCollection(name: string, url: string) {
    const sets = { ...(collections.sets ?? {}) };
    sets[name] = [...new Set([url, ...(sets[name] ?? [])])];
    collections.sets = sets;
    showToast(t("Saved to {collection}", { collection: name }), findAssetId("GifIcon"));
}

function CollectionsPage() {
    useProxy(collections);
    return <LogList
        title={t("GIF Collections")}
        empty={t("Long-press a message with a GIF and choose Save to Collection")}
        entries={Object.entries(collections.sets ?? {}).map(([name, gifs]) => ({
            key: name,
            label: name,
            subLabel: t("{count} GIFs", { count: gifs.length }),
            icon: "GifIcon",
            onPress: () => choose(name, [
                ...gifs.map(url => ({ label: url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60), value: url })),
                { label: t("Delete Collection"), value: "endcord:delete", danger: true },
            ], value => {
                if (value === "endcord:delete") {
                    const sets = { ...(collections.sets ?? {}) };
                    delete sets[name];
                    collections.sets = sets;
                } else {
                    const channelId = currentChannelId();
                    if (channelId) send(channelId, value);
                }
            }),
        }))}
    />;
}

const GifCollections = definePlugin({
    id: "endcord.gif-collections",
    name: "GifCollections",
    description: tx("Allows you to create collections of gifs."),
    authors: [ENDCORD_AUTHOR],
    icon: "GifIcon",
    tags: ["Media", "Fun"],
    SettingsComponent: CollectionsPage,
    async start({ cleanup }) {
        await awaitStorage(collections);
        cleanup(
            addMessageAction({
                key: "gif-collections",
                icon: "GifIcon",
                label: () => t("Save to Collection"),
                visible: m => gifsIn(m).length > 0,
                onPress: m => {
                    const url = gifsIn(m)[0];
                    choose(t("Save to Collection"), [
                        ...Object.keys(collections.sets ?? {}).map(name => ({ label: name, value: name })),
                        { label: t("New Collection…"), value: NEW_COLLECTION },
                    ], name => name !== NEW_COLLECTION ? addToCollection(name, url) : prompt({
                        title: t("New Collection"),
                        placeholder: t("Collection name"),
                        onSubmit: value => addToCollection(value.trim(), url),
                    }));
                },
            }),
            command({
                name: "gif",
                description: tx("Send a random GIF from one of your collections"),
                options: [{ name: "collection", description: tx("The collection's name"), required: true }],
                run: ({ collection }, ctx) => {
                    const gifs = collections.sets?.[String(collection).trim()] ?? [];
                    if (!gifs.length) {
                        botMessage(ctx.channel.id, t("You have no collection called {name}.", { name: collection }));
                        return;
                    }
                    return gifs[Math.floor(Math.random() * gifs.length)];
                },
            }),
        );
    },
});

// SaveFavoriteGIFs -----------------------------------------------------------------------------------------------------

const SaveFavoriteGIFs = definePlugin({
    id: "endcord.save-favorite-gifs",
    name: "SaveFavoriteGIFs",
    description: tx("Export favorited GIF urls"),
    authors: [ENDCORD_AUTHOR],
    icon: "GifIcon",
    tags: ["Media"],
    start({ cleanup }) {
        cleanup(command({
            name: "exportgifs",
            description: tx("Share the links of all your favorite GIFs"),
            run: async (_, ctx) => {
                const settings = getStore("UserSettingsProtoStore");
                const gifs = settings?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs ?? settings?.getFrecencySettings?.()?.favoriteGifs?.gifs ?? {};
                const urls = Object.keys(gifs);
                if (!urls.length) {
                    botMessage(ctx.channel.id, t("You have no favorite GIFs, or Discord hasn't loaded them yet."));
                    return;
                }
                await share(urls.join("\n"), t("Favorite GIFs"));
            },
        }));
    },
});

// Dearrow --------------------------------------------------------------------------------------------------------------

const youtubeId = (url?: string) => url?.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/)?.[1];

const Dearrow = definePlugin({
    id: "endcord.dearrow",
    name: "Dearrow",
    description: tx("Makes YouTube embed titles less sensationalist, powered by Dearrow"),
    authors: [ENDCORD_AUTHOR],
    icon: "VideoIcon",
    tags: ["Media"],
    start({ cleanup }) {
        // Video ID to its DeArrow title, or null when it has none
        const titles = new Map<string, string | null>();
        const retitle = (message: any) => {
            const embeds: any[] = message.embeds ?? [];
            let changed = false;
            const updated = embeds.map(e => {
                const title = titles.get(youtubeId(e.url)!);
                if (!title || e.title === title) return e;
                changed = true;
                return { ...e, title };
            });
            return changed ? { ...message, embeds: updated } : undefined;
        };
        const lookup = (message: any, videoId: string) => {
            titles.set(videoId, null);
            safeFetch(`https://sponsor.ajay.app/api/branding?videoID=${videoId}`)
                .then(r => r.json())
                .then(data => {
                    const best = (data?.titles ?? []).find((x: any) => !x.original && (x.locked || x.votes >= 0));
                    if (!best?.title) return;
                    titles.set(videoId, best.title.replace(/(^|\s)>(\S)/g, "$1$2"));
                    const updated = retitle(message);
                    if (updated) dispatchSoon({ type: "MESSAGE_UPDATE", message: { id: message.id, channel_id: message.channel_id, embeds: updated.embeds } });
                })
                .catch(() => { });
        };
        cleanup(onIncomingMessage("dearrow", message => {
            for (const embed of message.embeds ?? []) {
                const id = youtubeId(embed.url);
                if (id && !titles.has(id)) lookup(message, id);
            }
            return retitle(message);
        }));
    },
});

export default [FileViewer, PdfViewer, ZipPreview, FixFileExtensions, FavoriteAnything, GifCollections, SaveFavoriteGIFs, Dearrow];
