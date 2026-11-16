/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's AddAttachments: files added to a message you already sent. Long-press your message (or, while editing
 * it, tap the button beside the message box), pick files, and they're uploaded the way Discord's app uploads
 * attachments and added to the message, which keeps the ones it had. PC also takes pasted files; the phone's message
 * box doesn't hand those over.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { useEffect, useReducer } from "react";

import { definePlugin } from "../api";
import { addChatButton, currentUserId, getChatInputActionButton, getStore } from "../common";
import { formatBytes } from "../fileUpload/files";
import { showProgress } from "../fileUpload/progress";
import { isCancelled, localCopy, pickFiles, uploadToDiscord } from "../fileUpload/transfer";
import { addMessageAction, api, generatedIcon, toastError } from "../hooks";
import { canAddAttachments, room } from "./rules";

const transfers = new Set<{ cancel(): void; }>();

async function addAttachments(channelId: string, messageId: string, existing: Array<{ id: string; }>) {
    const left = room(existing.length);
    if (left <= 0) {
        showToast(t("You cannot add more attachments to this message."), findAssetId("CircleXIcon-primary"));
        return;
    }
    const picked = await pickFiles(true);
    if (!picked.length) return;
    if (picked.length > left) {
        showToast(left === 1
            ? t("You can only add 1 more attachment to this message.")
            : t("You can only add {count} more attachments to this message.", { count: left }), findAssetId("CircleXIcon-primary"));
        return;
    }
    const progress = showProgress(t("Add Attachments"), t("Uploading, this can take a while..."));
    transfers.add(progress);
    const copies: Array<() => void> = [];
    try {
        const files = [];
        for (const file of picked) {
            progress.update({ status: t("Getting {name} ready", { name: file.name }) });
            const copy = await localCopy(file);
            copies.push(copy.remove);
            if (!Number.isFinite(copy.file.size)) throw new Error(t("Couldn't tell how big {name} is", { name: file.name }));
            files.push({ name: copy.file.name, size: copy.file.size, mime: copy.file.mime, body: { uri: copy.file.uri } });
        }
        const total = files.reduce((sum, file) => sum + file.size, 0);
        progress.update({ status: t("Uploading {count} files ({size})", { count: files.length, size: formatBytes(total) }), sent: 0, total });
        const uploaded = await uploadToDiscord(channelId, files, { signal: progress.signal, onProgress: (sent, all) => progress.update({ sent, total: all }) });
        // Taken again: the message may have lost an attachment while the files went up
        const current: any[] = getStore("MessageStore")?.getMessage?.(channelId, messageId)?.attachments ?? existing;
        await api("patch", `/channels/${channelId}/messages/${messageId}`, {
            attachments: [...current.map(a => ({ id: a.id })), ...uploaded],
        });
        showToast(uploaded.length === 1 ? t("Attachment added successfully!") : t("Attachments added successfully!"), findAssetId("CheckmarkLargeIcon"));
    } catch (e) {
        if (isCancelled(e)) showToast(t("Upload cancelled"), findAssetId("CircleXIcon-primary"));
        else toastError(e);
    } finally {
        progress.close();
        transfers.delete(progress);
        copies.forEach(remove => remove());
    }
}

function start(message: any) {
    addAttachments(message.channel_id, message.id, message.attachments ?? []).catch(toastError);
}

/** Beside the message box while you edit one of your messages that can take more files */
function EditingButton() {
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        const stores = ["EditMessageStore", "SelectedChannelStore"].map(name => getStore(name)).filter(Boolean);
        stores.forEach(store => store.addChangeListener?.(redraw));
        return () => stores.forEach(store => store.removeChangeListener?.(redraw));
    }, []);
    const channelId: string | undefined = getStore("SelectedChannelStore")?.getChannelId?.();
    const editing = channelId ? getStore("EditMessageStore")?.getEditingMessage?.(channelId) : undefined;
    const Button = getChatInputActionButton();
    const Icon = generatedIcon("UploadIcon");
    if (!editing || !canAddAttachments(editing, currentUserId()) || !Button || !Icon) return null;
    return <Button accessibilityLabel={t("Add Attachments")} IconComponent={Icon} onPress={() => start(editing)} />;
}

export default definePlugin({
    id: "endcord.add-attachments",
    name: "AddAttachments",
    description: tx("Allows you to add new attachments while editing messages"),
    icon: "AttachmentIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        cleanup(
            addMessageAction({
                key: "add-attachments",
                icon: "UploadIcon",
                label: () => t("Add Attachments"),
                visible: message => canAddAttachments(message, currentUserId()),
                onPress: start,
            }),
            addChatButton({ key: "add-attachments", side: () => "right", render: EditingButton }),
            () => {
                for (const transfer of transfers) transfer.cancel();
                transfers.clear();
            },
        );
    },
});
