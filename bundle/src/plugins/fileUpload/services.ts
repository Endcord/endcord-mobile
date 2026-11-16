/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FileUpload's hosts, as Endcord PC sends to them: what each upload request is, and where the link is in the answer.
 * The file itself isn't here; index.tsx streams it as the form's file part or as the whole body.
 */

import { t } from "@core/i18n";
import { isPrivateUrl } from "@lib/utils/publicAddress";

import { toBase64, utf8 } from "../crypto";
import { extensionOf } from "./files";
import { parseShareXConfig, resolveShareXTemplate, withFilename } from "./sharex";
import { amzDate, encodePath, sign, UNSIGNED_PAYLOAD } from "./sigv4";

export const SERVICES = ["zipline", "nest", "ezhost", "0x0", "s3", "webdav", "sharex"] as const;
export type ServiceType = typeof SERVICES[number];

export const SERVICE_LABELS: Record<ServiceType, string> = {
    zipline: "Zipline",
    nest: "Nest",
    ezhost: "E-Z Host",
    "0x0": "0x0.st",
    s3: "S3-Compatible",
    webdav: "WebDAV",
    sharex: "ShareX Custom Uploader",
};

export interface UploadSettings {
    serviceType: string;
    serviceUrl: string;
    ziplineToken: string;
    folderId: string;
    nestToken: string;
    ezHostKey: string;
    s3Endpoint: string;
    s3Bucket: string;
    s3Region: string;
    s3AccessKeyId: string;
    s3SecretAccessKey: string;
    s3SessionToken: string;
    s3PublicUrl: string;
    s3Prefix: string;
    s3ForcePathStyle: boolean;
    webdavUrl: string;
    webdavUsername: string;
    webdavPassword: string;
    webdavDirectory: string;
    sharexConfig: string;
}

export interface FileInfo {
    name: string;
    mime: string;
}

export interface Answer {
    status: number;
    text: string;
    contentType: string;
}

export interface PlannedUpload {
    method: string;
    url: string;
    headers: Record<string, string>;
    /** A form with the file under `field` (after `fields`), the file as the whole body, or JSON without the file */
    body: { kind: "form"; field: string; fields: Array<[string, string]>; } | { kind: "file"; } | { kind: "json"; json: string; };
    /** The link to the uploaded file, from the host's answer; throws when the upload failed */
    read(answer: Answer): string;
}

interface ParsedUrl {
    /** host[:port], as the Host header has it (without :443) */
    authority: string;
    path: string;
    /** ?a=b, or empty */
    query: string;
}

/** An https address typed in a setting, which may not point at this phone or its network */
export function checkedAddress(url: string, what: string): ParsedUrl {
    const trimmed = url.trim();
    const match = /^https:\/\/([^/?#\s]+)([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i.exec(trimmed);
    if (!match) throw new Error(t("{what} must be an https:// address", { what }));
    if (match[1].includes("@")) throw new Error(t("{what} can't have a user name or password in it", { what }));
    if (isPrivateUrl(trimmed)) throw new Error(t("{what} can't be an address on this phone or its network", { what }));
    return { authority: match[1].toLowerCase().replace(/:443$/, ""), path: match[2], query: match[3] ?? "" };
}

/** A link from a host's answer, safe to put in a message: http(s), one line, no spaces */
export function checkedLink(link: unknown): string {
    const text = typeof link === "string" ? link.trim() : "";
    if (!/^https?:\/\/[^\s<>"'`]+$/i.test(text) || text.length > 2048) throw new Error(t("No URL returned from upload"));
    return text;
}

/** A link without its query (?…), keeping any #part */
export function stripQuery(link: string): string {
    const query = link.indexOf("?");
    if (query === -1) return link;
    const hash = link.indexOf("#", query);
    return link.slice(0, query) + (hash === -1 ? "" : link.slice(hash));
}

const ok = (status: number) => status >= 200 && status < 300;

/** One line of a failed answer, for the message that says so */
const failure = (answer: Answer) => new Error(t("Upload failed: {status} {error}", {
    status: answer.status,
    error: answer.text.replace(/\s+/g, " ").trim().slice(0, 200),
}));

function json(answer: Answer): any {
    try {
        return JSON.parse(answer.text);
    } catch {
        throw new Error(t("Server returned invalid response (not JSON)"));
    }
}

function required(value: string, what: string) {
    if (!value.trim()) throw new Error(t("{what} is required", { what }));
    return value.trim();
}

export function isConfigured(settings: UploadSettings): boolean {
    switch (settings.serviceType as ServiceType) {
        case "zipline": return !!(settings.serviceUrl.trim() && settings.ziplineToken.trim());
        case "nest": return !!settings.nestToken.trim();
        case "ezhost": return !!settings.ezHostKey.trim();
        case "0x0": return true;
        case "s3": return !!(settings.s3Endpoint.trim() && settings.s3Bucket.trim() && settings.s3Region.trim() && settings.s3AccessKeyId.trim() && settings.s3SecretAccessKey.trim());
        case "webdav": return !!settings.webdavUrl.trim();
        case "sharex":
            try {
                parseShareXConfig(settings.sharexConfig);
                return true;
            } catch {
                return false;
            }
        default: return false;
    }
}

const randomHex = (bytes: number) => Array.from({ length: bytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");

/** The request that uploads a file to the chosen host */
export function planUpload(settings: UploadSettings, file: FileInfo, now = new Date(), random: (bytes: number) => string = randomHex): PlannedUpload {
    switch (settings.serviceType as ServiceType) {
        case "zipline": {
            const base = checkedAddress(required(settings.serviceUrl, t("Zipline service URL")), t("Zipline service URL"));
            const headers: Record<string, string> = { Authorization: required(settings.ziplineToken, t("Zipline auth token")) };
            if (settings.folderId.trim()) headers["x-zipline-folder"] = settings.folderId.trim();
            return {
                method: "POST",
                url: `https://${base.authority}${base.path.replace(/\/+$/, "")}/api/upload`,
                headers,
                body: { kind: "form", field: "file", fields: [] },
                read: answer => {
                    if (!ok(answer.status)) throw failure(answer);
                    if (!answer.contentType.includes("application/json")) throw new Error(t("Server returned invalid response (not JSON)"));
                    return checkedLink(json(answer)?.files?.[0]?.url);
                },
            };
        }
        case "nest":
            return {
                method: "POST",
                url: "https://nest.rip/api/files/upload",
                headers: { Authorization: required(settings.nestToken, t("Nest API token")) },
                body: { kind: "form", field: "file", fields: [] },
                read: answer => {
                    if (!ok(answer.status)) throw failure(answer);
                    return checkedLink(json(answer)?.fileURL);
                },
            };
        case "ezhost":
            return {
                method: "POST",
                url: "https://api.e-z.host/files",
                headers: { key: required(settings.ezHostKey, t("E-Z Host API key")) },
                body: { kind: "form", field: "file", fields: [] },
                read: answer => {
                    if (!ok(answer.status)) throw failure(answer);
                    const data = json(answer);
                    if (!data?.success) throw new Error(typeof data?.error === "string" ? data.error.slice(0, 200) : t("Upload failed"));
                    return checkedLink(data.imageUrl || data.rawUrl);
                },
            };
        case "0x0":
            return {
                method: "POST",
                url: "https://0x0.st",
                headers: {},
                body: { kind: "form", field: "file", fields: [] },
                read: answer => {
                    if (!ok(answer.status)) throw failure(answer);
                    return checkedLink(answer.text);
                },
            };
        case "s3": return planS3(settings, file, now, random);
        case "webdav": {
            const base = checkedAddress(required(settings.webdavUrl, t("WebDAV server URL")), t("WebDAV server URL"));
            const url = `https://${base.authority}${base.path.replace(/\/+$/, "")}${encodePath(settings.webdavDirectory.trim(), file.name).replace(/^\/$/, "")}`;
            const headers: Record<string, string> = { "Content-Type": file.mime || "application/octet-stream" };
            if (settings.webdavUsername.trim() && settings.webdavPassword.trim()) {
                headers.Authorization = `Basic ${toBase64(utf8(`${settings.webdavUsername.trim()}:${settings.webdavPassword.trim()}`))}`;
            }
            return {
                method: "PUT",
                url,
                headers,
                body: { kind: "file" },
                read: answer => {
                    if (!ok(answer.status)) throw failure(answer);
                    return url;
                },
            };
        }
        case "sharex": return planShareX(settings, file);
        default: throw new Error(t("Please configure FileUpload settings first"));
    }
}

function planS3(settings: UploadSettings, file: FileInfo, now: Date, random: (bytes: number) => string): PlannedUpload {
    const what = t("S3 endpoint");
    const endpoint = checkedAddress(required(settings.s3Endpoint, what), what);
    const bucket = required(settings.s3Bucket, t("S3 bucket name"));
    if (!/^[A-Za-z0-9._-]{1,255}$/.test(bucket)) throw new Error(t("{what} isn't valid", { what: t("S3 bucket name") }));
    const region = required(settings.s3Region || "auto", t("S3 region"));
    const accessKeyId = required(settings.s3AccessKeyId, t("S3 access key ID"));
    const secretAccessKey = required(settings.s3SecretAccessKey, t("S3 secret access key"));
    // As on Endcord PC: the object is named by time and chance, keeping the file's extension
    const ext = extensionOf(file.name);
    const key = [...settings.s3Prefix.split("/").filter(Boolean), `${now.getTime()}-${random(8)}${ext ? `.${ext}` : ""}`].join("/");
    const pathStyle = settings.s3ForcePathStyle;
    const host = pathStyle ? endpoint.authority : `${bucket.toLowerCase()}.${endpoint.authority}`;
    const path = pathStyle ? encodePath(endpoint.path, bucket, key) : encodePath(endpoint.path, key);
    const headers: Record<string, string> = {
        "content-type": file.mime || "application/octet-stream",
        host,
        "x-amz-content-sha256": UNSIGNED_PAYLOAD,
        "x-amz-date": amzDate(now),
    };
    if (settings.s3SessionToken.trim()) headers["x-amz-security-token"] = settings.s3SessionToken.trim();
    const { authorization } = sign({ method: "PUT", path, headers, payloadHash: UNSIGNED_PAYLOAD }, { accessKeyId, secretAccessKey, region, service: "s3" });
    // The networking library sets Host itself, from the address
    const { host: _host, ...sent } = headers;
    const keyPath = encodePath(key).slice(1);
    let publicUrl: string;
    if (settings.s3PublicUrl.trim()) {
        const base = checkedAddress(settings.s3PublicUrl, t("Optional public base URL"));
        publicUrl = `https://${base.authority}${base.path.replace(/\/+$/, "")}/${keyPath}`;
    } else {
        publicUrl = pathStyle
            ? `https://${endpoint.authority}${encodePath(endpoint.path, bucket)}/${keyPath}`
            : `https://${host}${encodePath(endpoint.path).replace(/\/$/, "")}/${keyPath}`;
    }
    return {
        method: "PUT",
        url: `https://${host}${path}`,
        headers: { ...sent, Authorization: authorization },
        body: { kind: "file" },
        read: answer => {
            if (!ok(answer.status)) throw failure(answer);
            return publicUrl;
        },
    };
}

function planShareX(settings: UploadSettings, file: FileInfo): PlannedUpload {
    const config = parseShareXConfig(settings.sharexConfig);
    const target = checkedAddress(config.RequestURL, "ShareX RequestURL");
    const method = (config.RequestMethod || "POST").toUpperCase();
    if (!/^(POST|PUT|PATCH)$/.test(method)) throw new Error(t("Unsupported ShareX request method: {method}", { method: method.slice(0, 20) }));
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(config.Headers ?? {})) headers[name] = withFilename(value, file.name);
    const args = Object.entries(config.Arguments ?? {}).map(([name, value]) => [name, withFilename(value, file.name)] as [string, string]);
    const kind = (config.Body || "MultipartFormData").toLowerCase();
    let body: PlannedUpload["body"];
    if (kind === "multipartformdata" || kind === "formdata") {
        for (const name of Object.keys(headers)) if (name.toLowerCase() === "content-type") delete headers[name];
        body = { kind: "form", field: config.FileFormName || "file", fields: args };
    } else if (kind === "binary") {
        if (!Object.keys(headers).some(name => name.toLowerCase() === "content-type")) headers["Content-Type"] = file.mime || "application/octet-stream";
        body = { kind: "file" };
    } else if (kind === "json") {
        if (!Object.keys(headers).some(name => name.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
        body = { kind: "json", json: JSON.stringify(Object.fromEntries(args)) };
    } else {
        throw new Error(t("Unsupported ShareX Body type: {type}", { type: (config.Body || "?").slice(0, 40) }));
    }
    return {
        method,
        url: `https://${target.authority}${target.path}${target.query}`,
        headers,
        body,
        read: answer => {
            let parsed: unknown = null;
            try {
                parsed = answer.text ? JSON.parse(answer.text) : null;
            } catch { }
            if (!ok(answer.status)) {
                const configured = resolveShareXTemplate(config.ErrorMessage, answer.text, parsed);
                throw configured ? new Error(configured.slice(0, 200)) : failure(answer);
            }
            const configured = resolveShareXTemplate(config.URL, answer.text, parsed)?.trim();
            const fallback = parsed && typeof parsed === "object" && typeof (parsed as any).url === "string" ? (parsed as any).url : answer.text.trim();
            return checkedLink(configured || fallback);
        },
    };
}
