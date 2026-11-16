/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ZipPreview, with what Endcord PC's ZIP+ does that a phone can: long-press a message with a ZIP file to look inside
 * it, folder by folder, read the text files in it and save any file from it to the phone; and zip files from the phone
 * into one archive and send it to the chat (from Endcord Toolbox or the chat bar button). Nothing downloads until you
 * ask. PC also zips files of chosen types by itself when they're dropped or pasted; the phone's own attach button
 * doesn't hand its files over, so zipping is a button of its own here.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { useEdgeInsets } from "@ui/insets";
import { useState } from "react";
import { ScrollView } from "react-native";

import { definePlugin } from "../api";
import { addToolboxAction, getStore } from "../common";
import { base64ToBytes, bytesToBase64, uploadLimit } from "../fileSplitter/parts";
import { extensionOf, formatBytes, mimeFromName, safeFileName } from "../fileUpload/files";
import { Progress, showProgress } from "../fileUpload/progress";
import { blobToBase64, closeBlob, isCancelled, pickFiles, postWithAttachments, readBlob, removeCacheFile, saveFileAs, uploadToDiscord, writeCacheFile } from "../fileUpload/transfer";
import { addMessageAction, currentChannelId, toastError } from "../hooks";
import { pick } from "../shared/media";
import { chatButton } from "../shared/navigation";
import { choose, prompt, showText } from "../ui/dialogs";
import LogList from "../ui/LogList";
import { openPage } from "../ui/pages";
import { baseName, COMPRESSED, crc32, EntryError, isText, listFolder, readEntry, readZip, uniqueNames, writeZip, ZipEntry, ZipInput } from "./zip";

/** The biggest archive looked into, as before */
const MAX_ARCHIVE = 25 * 1024 * 1024;
/** The biggest text shown from an archive, and the biggest file saved from one */
const MAX_TEXT = 512 * 1024;
const MAX_SAVE = 25 * 1024 * 1024;
/** The most folders, and files, listed in a folder: a long list of rows takes the phone a while to draw */
const MAX_ROWS = 300;
/** The most characters of a text file shown at once */
const MAX_SHOWN = 100_000;
/** The most files zipped at once, and how much they may weigh together: they're held in memory to be zipped */
const MAX_ZIP_FILES = 50;
const MAX_ZIP_INPUT = 40 * 1024 * 1024;
/** How much is worked through before the app gets a moment to draw */
const STEP = 512 * 1024;

const fflate = () => findByProps("Inflate", "Deflate", "strFromU8");
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const transfers = new Set<Progress>();
let busy = false;

async function withProgress(title: string, run: (progress: Progress) => Promise<void>) {
    if (busy) return showToast(t("A file is already being zipped or downloaded"), findAssetId("CircleInformationIcon-primary"));
    busy = true;
    const progress = showProgress(title);
    transfers.add(progress);
    try {
        await run(progress);
    } catch (e) {
        if (isCancelled(e)) showToast(t("Cancelled"), findAssetId("CircleXIcon-primary"));
        else toastError(e);
    } finally {
        busy = false;
        progress.close();
        transfers.delete(progress);
    }
}

const isZip = (attachment: any) => extensionOf(String(attachment?.filename ?? "")) === "zip" || /zip/i.test(String(attachment?.content_type ?? ""));

function entryProblem(e: unknown) {
    if (!(e instanceof EntryError)) return e;
    if (e.reason === "encrypted") return new Error(t("This file is protected with a password"));
    if (e.reason === "method") return new Error(t("This file is compressed in a way that can't be opened here"));
    if (e.reason === "too-big") return new Error(t("This file is too big to open here"));
    if (e.reason === "mismatch") return new Error(t("This file is damaged or was changed: it isn't the size or checksum the ZIP file gives for it"));
    return new Error(t("Couldn't open this ZIP file"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Looking inside
// ---------------------------------------------------------------------------------------------------------------------

function openEntry(bytes: Uint8Array, entry: ZipEntry) {
    const name = baseName(entry.name);
    const choices = [];
    if (isText(entry.name) && entry.size <= MAX_TEXT) choices.push({ label: t("View as text"), value: "text", icon: "TextIcon" });
    if (entry.size <= MAX_SAVE) choices.push({ label: t("Save to the phone"), value: "save", icon: "DownloadIcon" });
    if (!choices.length) return toastError(new Error(t("This file is too big to open here")));
    choose(`${name} · ${formatBytes(entry.size)}`, choices, async action => {
        try {
            const zip = fflate();
            if (typeof zip?.Inflate !== "function") throw new Error(t("Discord's ZIP tools weren't found"));
            if (action === "text") {
                const data = readEntry(bytes, entry, MAX_TEXT, zip.Inflate);
                let text: string;
                try {
                    text = zip.strFromU8(data);
                } catch {
                    // Not UTF-8: byte by byte
                    text = zip.strFromU8(data, true);
                }
                showText(name, text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text || t("The file is empty."));
                return;
            }
            const data = readEntry(bytes, entry, MAX_SAVE, zip.Inflate);
            const file = await writeCacheFile(safeFileName(name), bytesToBase64(data));
            try {
                if (await saveFileAs(file, safeFileName(name), mimeFromName(name))) showToast(t("Saved {name}", { name }), findAssetId("CheckmarkLargeIcon"));
            } finally {
                removeCacheFile(file);
            }
        } catch (e) {
            toastError(entryProblem(e));
        }
    });
}

function Browser({ bytes, entries }: { bytes: Uint8Array; entries: ZipEntry[]; }) {
    const [folder, setFolder] = useState("");
    const { bottom } = useEdgeInsets();
    const { folders, files } = listFolder(entries, folder);
    const up = folder.replace(/[^/]+\/$/, "");
    const hidden = Math.max(0, folders.length - MAX_ROWS) + Math.max(0, files.length - MAX_ROWS);
    return <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 38 + bottom }}>
        <LogList
            title={folder ? `/${folder}` : t("{count} files", { count: entries.filter(e => !e.name.endsWith("/")).length })}
            empty={t("The archive is empty.")}
            entries={[
                ...folder ? [{ key: "..", label: `⬆ ${t("Back")}`, onPress: () => setFolder(up) }] : [],
                ...folders.slice(0, MAX_ROWS).map(name => ({ key: `d:${name}`, label: `📁 ${name}`, onPress: () => setFolder(folder + name) })),
                ...files.slice(0, MAX_ROWS).map(entry => ({
                    key: `f:${entry.name}`,
                    label: baseName(entry.name),
                    subLabel: entry.encrypted ? `${formatBytes(entry.size)} · 🔒` : formatBytes(entry.size),
                    icon: "FileIcon",
                    onPress: () => openEntry(bytes, entry),
                })),
                ...hidden ? [{ key: "more", label: t("{count} more aren't shown", { count: hidden }) }] : [],
            ]}
        />
    </ScrollView>;
}

function lookInside(attachment: any) {
    if (attachment.size > MAX_ARCHIVE) return showToast(t("This file is too big to look into"), findAssetId("CircleXIcon-primary"));
    const url = String(attachment.url ?? "");
    if (!/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(url)) return showToast(t("Couldn't open this ZIP file"), findAssetId("CircleXIcon-primary"));
    withProgress(t("View ZIP Contents"), async progress => {
        progress.update({ status: attachment.filename, sent: 0, total: attachment.size });
        const blob = await readBlob(url, { signal: progress.signal, timeoutMs: 10 * 60_000 });
        let bytes: Uint8Array;
        try {
            if (blob.size > MAX_ARCHIVE) throw new Error(t("This file is too big to look into"));
            bytes = base64ToBytes(await blobToBase64(blob));
        } finally {
            closeBlob(blob);
        }
        let entries: ZipEntry[];
        try {
            entries = readZip(bytes);
        } catch {
            throw new Error(t("Couldn't open this ZIP file"));
        }
        progress.close();
        openPage(String(attachment.filename ?? "ZIP"), () => <Browser bytes={bytes} entries={entries} />);
    });
}

// ---------------------------------------------------------------------------------------------------------------------
// Zipping files to send
// ---------------------------------------------------------------------------------------------------------------------

async function deflate(bytes: Uint8Array, Deflate: any): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const deflater = new Deflate({ level: 6 }, (chunk: Uint8Array) => {
        chunks.push(chunk);
        total += chunk.length;
    });
    if (!bytes.length) deflater.push(new Uint8Array(0), true);
    for (let i = 0; i < bytes.length; i += STEP) {
        deflater.push(bytes.subarray(i, i + STEP), i + STEP >= bytes.length);
        await tick();
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.length;
    }
    return out;
}

async function checksum(bytes: Uint8Array) {
    let crc = 0;
    for (let i = 0; i < bytes.length; i += STEP) {
        crc = crc32(bytes.subarray(i, i + STEP), crc);
        await tick();
    }
    return crc;
}

async function zipAndSend() {
    const channelId = currentChannelId();
    if (!channelId) return showToast(t("Open a chat to send the ZIP file to"), findAssetId("CircleInformationIcon-primary"));
    const zip = fflate();
    if (typeof zip?.Deflate !== "function") throw new Error(t("Discord's ZIP tools weren't found"));
    const picked = await pickFiles(true);
    if (!picked.length) return;
    if (picked.length > MAX_ZIP_FILES) return showToast(t("Zip at most {count} files at once", { count: MAX_ZIP_FILES }), findAssetId("CircleXIcon-primary"));
    const known = picked.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
    if (known > MAX_ZIP_INPUT) return showToast(t("Zip at most {size} at once on a phone", { size: formatBytes(MAX_ZIP_INPUT) }), findAssetId("CircleXIcon-primary"));
    const first = picked[0].name.replace(/\.[^.]*$/, "") || "files";
    prompt({
        title: t("Zip and send"),
        description: t("{count} files, sent as one ZIP file to this chat", { count: picked.length }),
        placeholder: "files.zip",
        initial: `${picked.length === 1 ? first : "files"}.zip`,
        confirm: t("Send"),
        onSubmit: value => {
            const name = safeFileName(value.trim().toLowerCase().endsWith(".zip") ? value.trim() : `${value.trim()}.zip`, "files.zip");
            // After the dialog has closed
            setTimeout(() => withProgress(t("Zip and send"), async progress => {
                const inputs: ZipInput[] = [];
                const names = uniqueNames(picked.map(file => file.name));
                let read = 0;
                for (const [i, file] of picked.entries()) {
                    progress.update({ status: t("Zipping {name}", { name: file.name }), sent: read, total: known || 1 });
                    const blob = await readBlob(file.uri, { signal: progress.signal });
                    let bytes: Uint8Array;
                    try {
                        read += blob.size;
                        if (read > MAX_ZIP_INPUT) throw new Error(t("Zip at most {size} at once on a phone", { size: formatBytes(MAX_ZIP_INPUT) }));
                        bytes = base64ToBytes(await blobToBase64(blob));
                    } finally {
                        closeBlob(blob);
                    }
                    if (progress.signal.aborted) return;
                    const crc = await checksum(bytes);
                    const packed = COMPRESSED.has(extensionOf(file.name)) ? bytes : await deflate(bytes, zip.Deflate);
                    inputs.push(packed.length < bytes.length
                        ? { name: names[i], size: bytes.length, crc, data: packed, method: 8 }
                        : { name: names[i], size: bytes.length, crc, data: bytes, method: 0 });
                }
                const archive = writeZip(inputs);
                inputs.length = 0;
                const limit = uploadLimit(getStore("UserStore")?.getCurrentUser?.()?.premiumType);
                if (archive.length > limit) throw new Error(t("The ZIP file is {size}; you can upload up to {limit}", { size: formatBytes(archive.length), limit: formatBytes(limit) }));
                progress.update({ status: t("Sending {name}", { name }), sent: 0, total: archive.length });
                const uploaded = await uploadToDiscord(channelId, [{ name, size: archive.length, mime: "application/zip", body: archive }], {
                    signal: progress.signal,
                    onProgress: (sent, total) => progress.update({ sent, total }),
                });
                await postWithAttachments(channelId, "", uploaded);
            }), 300);
        },
    });
}

export default definePlugin({
    id: "endcord.zip-preview",
    name: "ZipPreview",
    description: tx("Look inside ZIP files in chats, read and save the files in them, and zip files from your phone into one to send."),
    icon: "FileIcon",
    tags: ["Media", "Utility"],
    settings: {
        button: {
            type: "select",
            label: tx("Chat bar button"),
            description: tx("Zips files from your phone and sends them"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        const zips = (m: any): any[] => (m?.attachments ?? []).filter(isZip);
        cleanup(
            addMessageAction({
                key: "zip-preview",
                icon: "FileIcon",
                label: () => t("View ZIP Contents"),
                visible: m => zips(m).length > 0,
                onPress: m => pick(t("View ZIP Contents"), zips(m), lookInside),
            }),
            addToolboxAction("zip-preview", { label: () => t("Zip and send"), icon: "FileIcon", run: zipAndSend }),
            chatButton("zip-preview", store, "FileIcon", () => t("Zip and send"), zipAndSend),
            () => {
                for (const transfer of transfers) transfer.cancel();
                transfers.clear();
                busy = false;
            },
        );
    },
});
