/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's FileSplitter: a file too big for Discord is cut into parts ("clip.mp4.part1", "clip.mp4.part2"..., the
 * names PC gives them) and each part is sent to the chat in its own message. PC saves the parts for you to send, with
 * a Windows script that joins them; on a phone the parts are sent for you, and long-pressing one joins them back into
 * the file and saves it (PC's parts too), from the parts the same person sent only. The file is held in memory while
 * it's cut or joined, so at most MAX_FILE_BYTES: PC has no such limit.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { addToolboxAction, getStore } from "../common";
import { formatBytes, mimeFromName, safeFileName } from "../fileUpload/files";
import { Progress, showProgress } from "../fileUpload/progress";
import { blobToBase64, closeBlob, isCancelled, pickFiles, postWithAttachments, readBlob, removeCacheFile, saveFileAs, uploadToDiscord, writeCacheFile } from "../fileUpload/transfer";
import { addMessageAction, currentChannelId, displayName, getUser, loadedMessages, toastError } from "../hooks";
import { chatButton } from "../shared/navigation";
import { choose } from "../ui/dialogs";
import { findParts, FoundPart, isDiscordFile, joinBase64, MAX_FILE_BYTES, MAX_PARTS, partBytes, partLabel, partName, partOf, uploadLimit } from "./parts";

const transfers = new Set<Progress>();
let busy = false;

/** A moment between the parts' messages, so a big file doesn't run into Discord's limits on sending */
const BETWEEN_PARTS = 1500;
const wait = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener?.("abort", () => {
        clearTimeout(timer);
        resolve();
    });
});

const plugin = definePlugin({
    id: "endcord.file-splitter",
    name: "FileSplitter",
    description: tx("Split large files into multiple parts to bypass size limits and share them easily. Only people with Endcord can join the parts back into the file: long-press a part to join and save it."),
    icon: "FileIcon",
    tags: ["Utility", "Chat"],
    settings: {
        chunkSize: { type: "number", label: tx("Chunk size in MB (1-100)"), description: tx("Never more than you can upload"), default: 10, min: 1, max: 100 },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        cleanup(
            addToolboxAction("file-splitter", { label: () => t("File Splitter"), icon: "FileIcon", run: () => splitAndSend() }),
            chatButton("file-splitter", store, "FileIcon", () => t("File Splitter"), () => splitAndSend()),
            addMessageAction({
                key: "file-splitter-join",
                icon: "DownloadIcon",
                label: () => t("Join file parts"),
                visible: message => (message?.attachments ?? []).some((a: any) => partOf(a?.filename)),
                onPress: message => offerJoin(message),
            }),
            () => {
                for (const transfer of transfers) transfer.cancel();
                transfers.clear();
                busy = false;
            },
        );
    },
});

/** Runs one transfer at a time, with its progress dialog */
async function withProgress(title: string, run: (progress: Progress) => Promise<void>) {
    if (busy) return showToast(t("A file is already being split or joined"), findAssetId("CircleInformationIcon-primary"));
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

async function splitAndSend() {
    const channelId = currentChannelId();
    if (!channelId) return showToast(t("Open a chat to send the parts to"), findAssetId("CircleInformationIcon-primary"));
    const [file] = await pickFiles(false);
    if (!file) return;
    const limit = uploadLimit(getStore("UserStore")?.getCurrentUser?.()?.premiumType);
    const chunk = partBytes(plugin.store.chunkSize, limit);
    if (Number.isFinite(file.size) && file.size > MAX_FILE_BYTES) {
        return showToast(t("FileSplitter can split files up to {size} on a phone", { size: formatBytes(MAX_FILE_BYTES) }), findAssetId("CircleXIcon-primary"));
    }
    await withProgress(t("File Splitter"), async progress => {
        progress.update({ status: t("Reading {name}", { name: file.name }) });
        const blob = await readBlob(file.uri, { signal: progress.signal });
        try {
            const { size } = blob;
            if (size > MAX_FILE_BYTES) throw new Error(t("FileSplitter can split files up to {size} on a phone", { size: formatBytes(MAX_FILE_BYTES) }));
            if (!size) throw new Error(t("{name} is empty", { name: file.name }));
            const count = Math.ceil(size / chunk);
            if (count < 2) throw new Error(t("{name} is small enough to send as it is", { name: file.name }));
            if (count > MAX_PARTS) throw new Error(t("That would be more than {count} parts; choose a bigger chunk size", { count: MAX_PARTS }));
            for (let i = 0; i < count; i++) {
                if (i) await wait(BETWEEN_PARTS, progress.signal);
                const start = i * chunk;
                const part = blob.slice(start, Math.min(start + chunk, size));
                const name = partName(file.name, i + 1);
                progress.update({ status: t("Sending part {index} of {count}", { index: i + 1, count }), sent: start, total: size });
                try {
                    const uploaded = await uploadToDiscord(channelId, [{ name, size: part.size, mime: "application/octet-stream", body: part }], {
                        signal: progress.signal,
                        onProgress: sent => progress.update({ sent: start + sent, total: size }),
                    });
                    await postWithAttachments(channelId, partLabel(file.name, i + 1, count), uploaded);
                } finally {
                    closeBlob(part);
                }
            }
            showToast(t("Sent {name} in {count} parts", { name: file.name, count }), findAssetId("CheckmarkLargeIcon"));
        } finally {
            closeBlob(blob);
        }
    });
}

/** Who sent a message, as the app shows them, with their user name when that's different */
function senderName(message: any, authorId: string) {
    const user = getUser(authorId) ?? message.author;
    const name = displayName(user);
    const username = typeof user?.username === "string" ? user.username : "";
    return username && username !== name ? `${name} (@${username})` : name;
}

function offerJoin(message: any) {
    const first = (message.attachments ?? []).map((a: any) => partOf(a?.filename)).find(Boolean);
    if (!first) return;
    const authorId = message.author?.id;
    if (typeof authorId !== "string" || !authorId) return showToast(t("Couldn't tell who sent these parts"), findAssetId("CircleXIcon-primary"));
    // Only the parts the same person sent, nearest to this one: anyone else's would be someone slipping theirs in
    const { parts, total, missing, totalKnown } = findParts(loadedMessages(message.channel_id), first.base, { messageId: String(message.id), authorId });
    if (missing.length) {
        return showToast(missing.length === 1
            ? t("Part {index} of {name} isn't loaded: scroll up to it, then try again", { index: missing[0], name: first.base })
            : t("{count} parts of {name} aren't loaded: scroll up to them, then try again", { count: missing.length, name: first.base }), findAssetId("CircleXIcon-primary"));
    }
    if (parts.some(part => !isDiscordFile(part.url))) return showToast(t("These parts aren't Discord attachments"), findAssetId("CircleXIcon-primary"));
    const size = parts.reduce((sum, part) => sum + part.size, 0);
    if (size > MAX_FILE_BYTES) {
        return showToast(t("FileSplitter can join files up to {size} on a phone", { size: formatBytes(MAX_FILE_BYTES) }), findAssetId("CircleXIcon-primary"));
    }
    // Asked first: it downloads every part, from someone you can see
    const notes = [t("Sent by {name}", { name: senderName(message, authorId) })];
    if (!totalKnown) notes.push(t("The parts don't say how many there are, so this may not be the whole file"));
    choose(first.base, [{
        label: t("Download {count} parts ({size}) and join them", { count: total, size: formatBytes(size) }),
        subLabel: notes.join("\n"),
        value: "join",
        icon: "DownloadIcon",
    }], () => withProgress(t("Join file parts"), progress => join(first.base, parts, size, progress)));
}

async function join(name: string, parts: FoundPart[], size: number, progress: Progress) {
    const pieces: string[] = [];
    let done = 0;
    for (const part of parts) {
        progress.update({ status: t("Downloading part {index} of {count}", { index: part.index, count: parts.length }), sent: done, total: size });
        const blob = await readBlob(part.url, { signal: progress.signal, timeoutMs: 10 * 60_000 });
        try {
            // The sizes Discord gave are what was checked before anything downloaded: a part that weighs something
            // else isn't the one that was offered
            if (blob.size !== part.size) throw new Error(t("Part {index} isn't the size Discord gave for it", { index: part.index }));
            done += blob.size;
            if (done > MAX_FILE_BYTES) throw new Error(t("FileSplitter can join files up to {size} on a phone", { size: formatBytes(MAX_FILE_BYTES) }));
            pieces.push(await blobToBase64(blob));
        } finally {
            closeBlob(blob);
        }
    }
    progress.update({ status: t("Joining {name}", { name }), sent: size, total: size });
    const file = await writeCacheFile(name, joinBase64(pieces));
    pieces.length = 0;
    try {
        progress.close();
        if (await saveFileAs(file, safeFileName(name), mimeFromName(name))) showToast(t("Saved {name}", { name }), findAssetId("CheckmarkLargeIcon"));
    } finally {
        removeCacheFile(file);
    }
}

export default plugin;
