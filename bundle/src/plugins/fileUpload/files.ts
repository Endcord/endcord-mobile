/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * File names, types and sizes for the plugins that send files (FileUpload, AddAttachments, FileSplitter, ZipPreview...),
 * without Discord.
 */

/** Discord takes at most 10 attachments on a message */
export const MAX_ATTACHMENTS = 10;

/** The longest file name kept; Discord shows far less */
export const MAX_NAME_LENGTH = 120;

export function extensionOf(name: string): string {
    const dot = name.lastIndexOf(".");
    if (dot < 1 || dot === name.length - 1) return "";
    const ext = name.slice(dot + 1).toLowerCase();
    return ext.length <= 10 && /^[a-z0-9]+$/.test(ext) ? ext : "";
}

/**
 * A file name that's safe in a form's header, a link and a path: no folders, quotes, control or invisible characters,
 * at most MAX_NAME_LENGTH characters with its extension kept
 */
export function safeFileName(name: unknown, fallback = "file"): string {
    let clean = typeof name === "string" ? name.slice(0, 1000) : "";
    clean = clean.split(/[\\/]/).pop() ?? "";
    clean = clean.replace(/[\u0000-\u001f\u007f-\u009f"<>|*?:\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").trim();
    clean = clean.replace(/^\.+/, "");
    if (!clean) return fallback;
    const chars = Array.from(clean);
    if (chars.length <= MAX_NAME_LENGTH) return clean;
    const ext = extensionOf(clean);
    const keep = MAX_NAME_LENGTH - (ext ? ext.length + 1 : 0);
    return chars.slice(0, keep).join("") + (ext ? `.${ext}` : "");
}

const MIME_TYPES: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic",
    bmp: "image/bmp", svg: "image/svg+xml", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    mkv: "video/x-matroska", mp3: "audio/mpeg", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4",
    flac: "audio/flac", zip: "application/zip", pdf: "application/pdf", txt: "text/plain", json: "application/json",
    apk: "application/vnd.android.package-archive", "7z": "application/x-7z-compressed", rar: "application/vnd.rar",
};

/** The type a file's extension stands for, or a plain stream of bytes */
export function mimeFromName(name: string, given?: unknown): string {
    if (typeof given === "string" && /^[a-z]+\/[\w.+-]+$/i.test(given) && given !== "application/octet-stream") return given;
    return MIME_TYPES[extensionOf(name)] ?? "application/octet-stream";
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** The host of a link, for messages; never the whole link, which can carry a key */
export function hostOf(url: string): string {
    const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#@\s]*@)?([^/?#\s:]+|\[[^\]]+\])/i.exec(url);
    return match?.[2] ?? "?";
}

/** Whether a file passes a "png,jpg,mp4" filter; an empty filter lets everything through */
export function isAllowedType(name: string, filter: string): boolean {
    const allowed = filter.split(/[\s,;]+/).map(ext => ext.trim().replace(/^\./, "").toLowerCase()).filter(Boolean);
    if (!allowed.length) return true;
    const ext = extensionOf(name);
    return !!ext && allowed.includes(ext);
}
