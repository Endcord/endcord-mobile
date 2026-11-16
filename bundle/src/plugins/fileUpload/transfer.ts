/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Moving files, for the plugins that send them: FileUpload (to a file host), and AddAttachments,
 * FileSplitter, RemixRevived and ZipPreview (to Discord, the way its app uploads attachments). A picked file is never
 * read into JavaScript here: React Native's networking streams it from where it is ({ uri } bodies and form parts) and
 * says how much has gone, so a big file costs no memory and the progress shows.
 */

import { t } from "@core/i18n";
import { NativeFileModule } from "@lib/api/native/modules";
import { findByProps } from "@metro";

import { api, localSnowflake } from "../hooks";
import { hostOf, mimeFromName, safeFileName } from "./files";

export { MAX_ATTACHMENTS } from "./files";

export class CancelledError extends Error {
    constructor() {
        super(t("Cancelled"));
        this.name = "CancelledError";
    }
}

export const isCancelled = (e: unknown) => e instanceof CancelledError || (e as any)?.name === "CancelledError";

// ---------------------------------------------------------------------------------------------------------------------
// Picking and saving files: Discord's own document picker (@react-native-documents/picker)
// ---------------------------------------------------------------------------------------------------------------------

export interface PickedFile {
    /** A content:// (or file://) link to the file, which only this app may read */
    uri: string;
    name: string;
    /** In bytes; NaN when the picker didn't say */
    size: number;
    mime: string;
}

export const documentPicker = () => findByProps("pick", "keepLocalCopy", "saveDocuments");

function pickerCancelled(picker: any, e: unknown) {
    const code = (e as any)?.code;
    return code === picker?.errorCodes?.OPERATION_CANCELED || code === "OPERATION_CANCELED" || code === "DOCUMENT_PICKER_CANCELED";
}

/** Opens Android's file picker; an empty list when nothing was picked */
export async function pickFiles(multiple: boolean, mimeTypes?: string[]): Promise<PickedFile[]> {
    const picker = documentPicker();
    if (typeof picker?.pick !== "function") throw new Error(t("Discord's file picker wasn't found"));
    let picked: unknown;
    try {
        picked = await picker.pick({ allowMultiSelection: multiple, type: mimeTypes ?? [picker.types?.allFiles ?? "*/*"] });
    } catch (e) {
        if (pickerCancelled(picker, e)) return [];
        throw e;
    }
    if (!Array.isArray(picked)) return [];
    return picked
        .filter(file => file && typeof file.uri === "string" && /^(content|file):\/\//i.test(file.uri) && !file.error)
        .map(file => {
            const name = safeFileName(file.name, "file");
            return { uri: file.uri, name, size: typeof file.size === "number" && file.size >= 0 ? file.size : NaN, mime: mimeFromName(name, file.type) };
        });
}

/**
 * What `work` gives, unless `signal` is aborted first: then a CancelledError right away, and what `work` gives later
 * is handed to `undo`, for work native code goes on with that can't be stopped
 */
export function unlessCancelled<T>(work: Promise<T>, signal: AbortSignal | undefined, undo: (result: T) => void): Promise<T> {
    if (!signal) return work;
    return new Promise<T>((resolve, reject) => {
        let cancelled = signal.aborted;
        const onAbort = () => {
            cancelled = true;
            reject(new CancelledError());
        };
        if (cancelled) reject(new CancelledError());
        else signal.addEventListener?.("abort", onAbort);
        work.then(result => {
            signal.removeEventListener?.("abort", onAbort);
            if (!cancelled) return resolve(result);
            try {
                undo(result);
            } catch { }
        }, error => {
            signal.removeEventListener?.("abort", onAbort);
            reject(error);
        });
    });
}

/**
 * A copy of a picked file in the app's cache. Some places a file can be picked from (a cloud drive) hand it over as a
 * stream that can't say how long it is, and an upload with the wrong length fails; a copy is a plain file. Aborting
 * `signal` stops waiting for the copy, which is deleted when it's done.
 */
export async function localCopy(file: PickedFile, signal?: AbortSignal): Promise<{ file: PickedFile; remove: () => void; }> {
    const picker = documentPicker();
    if (file.uri.startsWith("file://") || typeof picker?.keepLocalCopy !== "function") return { file, remove: () => { } };
    if (signal?.aborted) throw new CancelledError();
    const copying: Promise<any[]> = Promise.resolve(picker.keepLocalCopy({ files: [{ uri: file.uri, fileName: file.name }], destination: "cachesDirectory" }));
    const [copy] = await unlessCancelled(copying, signal, copies => {
        for (const late of Array.isArray(copies) ? copies : []) if (typeof late?.localUri === "string") removeCacheFile(late.localUri);
    });
    if (copy?.status !== "success" || typeof copy.localUri !== "string") {
        throw new Error(t("Couldn't read {name}: {error}", { name: file.name, error: String(copy?.copyError ?? "?") }));
    }
    let { size } = file;
    if (!Number.isFinite(size)) {
        const measured = Number(await Promise.resolve(NativeFileModule.getSize?.(copy.localUri)).catch(() => NaN));
        size = Number.isFinite(measured) && measured >= 0 ? measured : NaN;
    }
    return { file: { ...file, uri: copy.localUri, size }, remove: () => removeCacheFile(copy.localUri) };
}

/** Deletes a file this plugin put in the app's cache, by its file:// link; nothing outside the cache */
export function removeCacheFile(fileUri: string) {
    try {
        const cache: string | undefined = NativeFileModule.getConstants?.().CacheDirPath;
        const path = decodeURIComponent(fileUri.replace(/^file:\/\//, ""));
        if (!cache || !path.startsWith(`${cache}/`)) return;
        const relative = path.slice(cache.length + 1);
        if (!relative || relative.split("/").some(part => !part || part === "." || part === "..")) return;
        Promise.resolve(NativeFileModule.removeFile("cache", relative)).catch(() => { });
    } catch { }
}

/** Writes bytes (as base64) to a file in the app's cache, returning its file:// link */
export async function writeCacheFile(name: string, base64: string): Promise<string> {
    const relative = `endcord/${Date.now().toString(36)}/${safeFileName(name)}`;
    const written: unknown = await NativeFileModule.writeFile("cache", relative, base64, "base64");
    const cache: string | undefined = NativeFileModule.getConstants?.().CacheDirPath;
    const path = typeof written === "string" && written.startsWith("/") ? written : `${cache}/${relative}`;
    // Encoded, so a # or % in the name stays part of it
    return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Lets the user save a file from the app's cache wherever they like, with Android's "save as" screen. False when
 * they backed out.
 */
export async function saveFileAs(fileUri: string, name: string, mime: string): Promise<boolean> {
    const picker = documentPicker();
    if (typeof picker?.saveDocuments !== "function") throw new Error(t("Discord's file picker wasn't found"));
    try {
        const [saved] = await picker.saveDocuments({ sourceUris: [fileUri], copy: true, mimeType: mime, fileName: name });
        if (saved?.error) throw new Error(String(saved.error));
        return true;
    } catch (e) {
        if (pickerCancelled(picker, e)) return false;
        throw e;
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Requests with progress
// ---------------------------------------------------------------------------------------------------------------------

export interface RequestOptions {
    method: string;
    url: string;
    headers?: Record<string, string>;
    /**
     * A string, FormData (parts can be { uri, name, type }), bytes (a Uint8Array), a Blob, or { uri } to stream a file,
     * which React Native's networking takes as it is
     */
    body?: unknown;
    onProgress?: (sent: number, total: number) => void;
    /** 0 for none */
    timeoutMs?: number;
    signal?: AbortSignal;
}

export interface Reply {
    status: number;
    text: string;
    header(name: string): string | null;
}

/** The most of a reply that's kept: an upload's answer is a link or a little JSON */
const MAX_REPLY = 1_000_000;

export function request(options: RequestOptions): Promise<Reply> {
    return new Promise((resolve, reject) => {
        if (options.signal?.aborted) return reject(new CancelledError());
        const xhr = new XMLHttpRequest();
        let settled = false;
        const onAbort = () => {
            try {
                xhr.abort();
            } catch { }
            finish(() => reject(new CancelledError()));
        };
        const finish = (then: () => void) => {
            if (settled) return;
            settled = true;
            options.signal?.removeEventListener?.("abort", onAbort);
            then();
        };
        xhr.open(options.method, options.url);
        for (const [name, value] of Object.entries(options.headers ?? {})) xhr.setRequestHeader(name, value);
        xhr.timeout = options.timeoutMs ?? 0;
        if (options.onProgress && xhr.upload) {
            xhr.upload.onprogress = (event: any) => options.onProgress?.(Number(event?.loaded) || 0, Number(event?.total) || 0);
        }
        xhr.onload = () => finish(() => resolve({
            status: xhr.status,
            text: String(xhr.responseText ?? "").slice(0, MAX_REPLY),
            header: name => xhr.getResponseHeader(name),
        }));
        xhr.onerror = () => finish(() => reject(new Error(t("Couldn't reach {host}", { host: hostOf(options.url) }))));
        xhr.ontimeout = () => finish(() => reject(new Error(t("The upload took too long"))));
        xhr.onabort = () => finish(() => reject(new CancelledError()));
        options.signal?.addEventListener?.("abort", onAbort);
        xhr.send((options.body ?? null) as any);
    });
}

/**
 * A picked file or a download as a Blob, whose bytes React Native keeps outside JavaScript, to cut with slice() and
 * send as a request's body. close() it when done.
 */
export function readBlob(uri: string, { signal, timeoutMs = 0 }: { signal?: AbortSignal; timeoutMs?: number; } = {}): Promise<Blob> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new CancelledError());
        const xhr = new XMLHttpRequest();
        const onAbort = () => xhr.abort();
        const done = (then: () => void) => {
            signal?.removeEventListener?.("abort", onAbort);
            then();
        };
        xhr.open("GET", uri);
        xhr.responseType = "blob";
        xhr.timeout = timeoutMs;
        xhr.onload = () => done(() => {
            // A file on the phone answers with 0
            const ok = xhr.status === 0 || xhr.status >= 200 && xhr.status < 300;
            if (ok && xhr.response && typeof xhr.response.slice === "function") resolve(xhr.response);
            else reject(new Error(t("Couldn't get {host} ({status})", { host: hostOf(uri), status: xhr.status })));
        });
        xhr.onerror = () => done(() => reject(new Error(t("Couldn't reach {host}", { host: hostOf(uri) }))));
        xhr.ontimeout = () => done(() => reject(new Error(t("The download took too long"))));
        xhr.onabort = () => done(() => reject(new CancelledError()));
        signal?.addEventListener?.("abort", onAbort);
        xhr.send();
    });
}

/** A Blob's bytes as base64, which is how they can be written to a file */
export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const data = String(reader.result ?? "");
            resolve(data.slice(data.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error(t("Couldn't read the file")));
        reader.readAsDataURL(blob);
    });
}

/** Frees a Blob's bytes */
export const closeBlob = (blob: unknown) => {
    try {
        (blob as any)?.close?.();
    } catch { }
};

// ---------------------------------------------------------------------------------------------------------------------
// Attachments on Discord
// ---------------------------------------------------------------------------------------------------------------------

export interface DiscordFile {
    name: string;
    size: number;
    mime: string;
    /** What request() sends: { uri } for a file, a Uint8Array or a Blob for bytes */
    body: unknown;
}

export interface UploadedAttachment {
    id: string;
    filename: string;
    uploaded_filename: string;
}

/**
 * Puts files where Discord keeps attachments, the way its app does before sending a message with them (and as
 * Endcord PC's AddAttachments does): Discord gives a link for each, and the file goes there. `ids` start at `firstId`.
 */
export async function uploadToDiscord(channelId: string, files: DiscordFile[], { onProgress, signal, firstId = 0 }: {
    onProgress?: (sent: number, total: number) => void;
    signal?: AbortSignal;
    firstId?: number;
} = {}): Promise<UploadedAttachment[]> {
    if (!files.length) return [];
    if (signal?.aborted) throw new CancelledError();
    const res = await api("post", `/channels/${channelId}/attachments`, {
        files: files.map((file, i) => ({ id: String(firstId + i), filename: file.name, file_size: file.size, is_clip: false })),
    });
    const slots: any[] = Array.isArray(res?.attachments) ? res.attachments : [];
    const total = files.reduce((sum, file) => sum + file.size, 0);
    let done = 0;
    const uploaded: UploadedAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
        if (signal?.aborted) throw new CancelledError();
        const id = String(firstId + i);
        const slot = slots.find(s => String(s?.id) === id) ?? slots[i];
        // Only to where Discord said, and only over https
        if (typeof slot?.upload_url !== "string" || !/^https:\/\/[^\s/]+\//i.test(slot.upload_url) || typeof slot.upload_filename !== "string") {
            throw new Error(t("Discord didn't say where to upload {name}", { name: files[i].name }));
        }
        const file = files[i];
        const reply = await request({
            method: "PUT",
            url: slot.upload_url,
            // React Native's networking on Android refuses a body without one
            headers: { "Content-Type": file.mime || "application/octet-stream" },
            body: file.body,
            signal,
            onProgress: sent => onProgress?.(done + Math.min(sent, file.size), total),
        });
        if (reply.status < 200 || reply.status >= 300) throw new Error(t("Discord didn't take {name} ({status})", { name: file.name, status: reply.status }));
        done += file.size;
        onProgress?.(done, total);
        uploaded.push({ id, filename: file.name, uploaded_filename: slot.upload_filename });
    }
    return uploaded;
}

/** Sends a message with uploaded attachments; mentions in its text never ping */
export function postWithAttachments(channelId: string, content: string, attachments: UploadedAttachment[], extra: Record<string, unknown> = {}) {
    return api("post", `/channels/${channelId}/messages`, {
        content,
        nonce: localSnowflake(),
        attachments,
        allowed_mentions: { parse: [] },
        ...extra,
    });
}
