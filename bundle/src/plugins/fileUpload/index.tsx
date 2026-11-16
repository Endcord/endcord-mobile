/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's FileUpload: files go to your own file host (Zipline, Nest, E-Z Host, 0x0.st, an S3-compatible bucket,
 * WebDAV or a ShareX config) instead of Discord, and the link is put in the message box and copied. A button beside
 * the message box picks files, or takes the ones already waiting above it. The file streams from where it is, with
 * the progress shown and a button to cancel.
 *
 * Not from PC: the hosts PC reaches through its desktop app or a CORS proxy, falling back to other hosts when one
 * fails (a file would go somewhere you didn't choose), the link helpers for embeds, APNG to GIF, uploading media from a
 * message again (it downloads it first, on a slow connection), and taking over Discord's own uploads and pastes.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { getStore, moduleAt } from "../common";
import { copy, currentChannelId, insertText, toastError } from "../hooks";
import { chatButton } from "../shared/navigation";
import { choose } from "../ui/dialogs";
import { extensionOf, formatBytes, isAllowedType, mimeFromName, safeFileName } from "./files";
import { Progress, showProgress } from "./progress";
import { isConfigured, planUpload, SERVICE_LABELS, SERVICES, ServiceType, stripQuery, UploadSettings } from "./services";
import { isCancelled, localCopy, PickedFile, pickFiles, request } from "./transfer";

const transfers = new Set<Progress>();
let uploading = false;

/** DraftType.ChannelMessage: the files waiting above the message box */
const draftType = () => moduleAt("stores/DraftStore.tsx")?.DraftType?.ChannelMessage ?? 0;

/** The files waiting above the message box that can be read from where they are */
function draftUploads(channelId: string): Array<{ upload: any; file: PickedFile; }> {
    const uploads = getStore("UploadAttachmentStore")?.getUploads?.(channelId, draftType());
    if (!Array.isArray(uploads)) return [];
    return uploads.flatMap(upload => {
        const uri = upload?.item?.uri ?? upload?.item?.file?.uri;
        if (typeof uri !== "string" || !/^(content|file):\/\//i.test(uri) || upload?.isThumbnail) return [];
        const name = safeFileName(upload.filename ?? upload.item?.filename);
        const size = Number(upload.preCompressionSize ?? upload.currentSize ?? upload.item?.size);
        return [{ upload, file: { uri, name, size: Number.isFinite(size) ? size : NaN, mime: mimeFromName(name, upload.mimeType ?? upload.item?.mimeType) } }];
    });
}

function removeFromDraft(channelId: string, upload: any) {
    try {
        if (typeof upload?.removeFromMsgDraft === "function") return upload.removeFromMsgDraft();
        const actions = moduleAt("actions/UploadAttachmentActionCreators.tsx")?.default ?? findByProps("setUploads", "addFiles", "popFirstFile");
        actions?.remove?.(channelId, upload.id, draftType());
    } catch (e) {
        console.warn("[Endcord] FileUpload couldn't take an uploaded file out of the message box", e);
    }
}

const plugin = definePlugin({
    id: "endcord.file-upload",
    name: "FileUpload",
    description: tx("Upload files to hosting services like Zipline, Nest, S3, and WebDAV"),
    icon: "CloudIcon",
    tags: ["Media"],
    settings: {
        serviceType: {
            type: "select",
            label: tx("Selected uploader service"),
            default: "zipline",
            options: SERVICES.map(value => ({ label: SERVICE_LABELS[value], value })),
            // Where your files go: a backup someone else made could send them to a public host instead of yours
            sensitive: true,
        },
        serviceUrl: { type: "string", label: tx("Zipline service URL"), default: "", placeholder: "https://zipline.example.com", sensitive: true },
        ziplineToken: { type: "string", label: tx("Zipline auth token"), default: "", sensitive: true },
        folderId: { type: "string", label: tx("Optional Zipline folder ID"), default: "" },
        nestToken: { type: "string", label: tx("Nest API token"), default: "", sensitive: true },
        ezHostKey: { type: "string", label: tx("E-Z Host API key"), default: "", sensitive: true },
        s3Endpoint: { type: "string", label: tx("S3-compatible endpoint URL"), default: "", placeholder: "https://<account>.r2.cloudflarestorage.com", sensitive: true },
        s3Bucket: { type: "string", label: tx("S3 bucket name"), default: "", sensitive: true },
        s3Region: { type: "string", label: tx("S3 region (use auto for R2)"), default: "auto" },
        s3AccessKeyId: { type: "string", label: tx("S3 access key ID"), default: "", sensitive: true },
        s3SecretAccessKey: { type: "string", label: tx("S3 secret access key"), default: "", sensitive: true },
        s3SessionToken: { type: "string", label: tx("Optional S3 session token"), default: "", sensitive: true },
        s3PublicUrl: { type: "string", label: tx("Optional public base URL"), description: tx("Where the uploaded files can be seen, if not at the endpoint"), default: "", sensitive: true },
        s3Prefix: { type: "string", label: tx("Optional S3 object key prefix"), default: "", sensitive: true },
        s3ForcePathStyle: { type: "boolean", label: tx("Use path-style S3 URLs"), default: true },
        webdavUrl: { type: "string", label: tx("WebDAV server URL"), default: "", sensitive: true },
        webdavUsername: { type: "string", label: tx("WebDAV username"), default: "", sensitive: true },
        webdavPassword: { type: "string", label: tx("WebDAV password or app token"), default: "", sensitive: true },
        webdavDirectory: { type: "string", label: tx("Optional subdirectory on the WebDAV server"), default: "" },
        sharexConfig: { type: "string", label: tx("ShareX custom uploader JSON"), description: tx("Paste the contents of a .sxcu file"), default: "", multiline: true, sensitive: true },
        autoCopy: { type: "boolean", label: tx("Auto copy upload URL"), default: true },
        autoSend: { type: "boolean", label: tx("Insert uploaded URL in chat input"), default: true },
        autoFormat: { type: "boolean", label: tx("Wrap inserted URL in angle brackets"), default: false },
        stripQueryParams: { type: "boolean", label: tx("Strip query params from uploaded URLs"), default: false },
        preserveOriginalFilename: { type: "boolean", label: tx("Preserve the original filename when uploading."), default: true },
        uploadAllowedFileTypes: {
            type: "string",
            label: tx("Allowed file types"),
            description: tx("Comma-separated list of allowed file extensions (e.g. png,jpg,gif,mp4). Leave empty to allow all files."),
            default: "",
        },
        uploadTimeoutMinutes: { type: "number", label: tx("Upload timeout in minutes"), default: 10, min: 1, max: 120 },
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "left",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        cleanup(
            chatButton("file-upload", store, "FileUpIcon", () => t("Upload to Host"), () => open(store)),
            () => {
                for (const transfer of transfers) transfer.cancel();
                transfers.clear();
                uploading = false;
            },
        );
    },
});

type Store = typeof plugin.store;

function open(store: Store) {
    const channelId = currentChannelId();
    if (!channelId) return;
    if (uploading) return showToast(t("Upload already in progress"), findAssetId("CircleInformationIcon-primary"));
    if (!isConfigured(store as unknown as UploadSettings)) return showToast(t("Please configure FileUpload settings first"), findAssetId("CircleXIcon-primary"));
    const waiting = draftUploads(channelId);
    const pick = () => pickFiles(true).then(files => uploadAll(store, channelId, files.map(file => ({ file })))).catch(toastError);
    if (!waiting.length) return pick();
    choose(t("Upload to Host"), [
        { label: t("Choose File..."), value: -1, icon: "FileUpIcon" },
        ...waiting.map((entry, i) => ({ label: entry.file.name, subLabel: t("Waiting above the message box"), value: i, icon: "AttachmentIcon" })),
    ], index => {
        if (index === -1) pick();
        else uploadAll(store, channelId, [waiting[index]]).catch(toastError);
    });
}

async function uploadAll(store: Store, channelId: string, entries: Array<{ file: PickedFile; upload?: any; }>) {
    const settings = store as unknown as UploadSettings;
    const allowed = entries.filter(entry => isAllowedType(entry.file.name, store.uploadAllowedFileTypes));
    if (allowed.length < entries.length) showToast(t("File type not allowed by current filter"), findAssetId("CircleXIcon-primary"));
    if (!allowed.length || uploading) return;
    uploading = true;
    const service = SERVICE_LABELS[store.serviceType as ServiceType] ?? store.serviceType;
    const progress = showProgress(t("Uploading to {service}", { service }));
    transfers.add(progress);
    const links: string[] = [];
    try {
        for (const [i, entry] of allowed.entries()) {
            const suffix = allowed.length > 1 ? ` (${i + 1}/${allowed.length})` : "";
            progress.update({ status: t("Preparing {name}", { name: entry.file.name }) + suffix, sent: 0, total: 0 });
            // Cancel stops this too: a copy still being made is deleted once it's done
            const local = await localCopy(entry.file, progress.signal);
            try {
                const ext = extensionOf(local.file.name);
                const name = store.preserveOriginalFilename ? local.file.name : `upload.${ext || "bin"}`;
                const plan = planUpload(settings, { name, mime: local.file.mime });
                let body: unknown;
                if (plan.body.kind === "form") {
                    const form = new FormData();
                    form.append(plan.body.field, { uri: local.file.uri, name, type: local.file.mime } as any);
                    for (const [field, value] of plan.body.fields) form.append(field, value);
                    body = form;
                } else if (plan.body.kind === "file") {
                    body = { uri: local.file.uri };
                } else {
                    body = plan.body.json;
                }
                const size = Number.isFinite(local.file.size) ? local.file.size : 0;
                progress.update({ status: (size ? `${name} · ${formatBytes(size)}` : name) + suffix, sent: 0, total: size });
                const reply = await request({
                    method: plan.method,
                    url: plan.url,
                    headers: plan.headers,
                    body,
                    signal: progress.signal,
                    timeoutMs: Math.max(1, store.uploadTimeoutMinutes) * 60_000,
                    onProgress: (sent, total) => progress.update({ sent, total: total || size }),
                });
                const link = plan.read({ status: reply.status, text: reply.text, contentType: reply.header("content-type") ?? "" });
                links.push(store.stripQueryParams ? stripQuery(link) : link);
                if (entry.upload) removeFromDraft(channelId, entry.upload);
            } finally {
                local.remove();
            }
        }
    } catch (e) {
        if (isCancelled(e)) showToast(t("Upload cancelled"), findAssetId("CircleXIcon-primary"));
        else toastError(e);
    } finally {
        uploading = false;
        progress.close();
        transfers.delete(progress);
    }
    if (!links.length) return;
    const text = links.map(link => store.autoFormat ? `<${link}>` : link).join("\n");
    // When the message box isn't open any more, the link is copied instead, so it isn't lost
    const inserted = store.autoSend && insertText(channelId, `${text} `);
    if (store.autoCopy || store.autoSend && !inserted) copy(links.join("\n"), t("Upload successful, URL copied to clipboard"));
    else showToast(t("Upload successful"), findAssetId("CheckmarkLargeIcon"));
}

export default plugin;
