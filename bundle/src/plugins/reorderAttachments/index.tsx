/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ReorderAttachments: the files waiting above the message box are sent in the order you choose. PC drags
 * them; on a phone a button beside the message box (shown with two files or more) lists them, and you pick a file and
 * where it goes. The new order is Discord's own (UploadAttachmentStore), so the message is sent that way.
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";
import { useEffect, useReducer } from "react";

import { definePlugin } from "../api";
import { addChatButton, getChatInputActionButton, getStore, moduleAt } from "../common";
import { generatedIcon, toastError } from "../hooks";
import { choose } from "../ui/dialogs";
import { isShown, moveUpload } from "./order";

/** DraftType.ChannelMessage: the files of the message box */
const draftType = () => moduleAt("stores/DraftStore.tsx")?.DraftType?.ChannelMessage ?? 0;

const uploadActions = () => moduleAt("actions/UploadAttachmentActionCreators.tsx")?.default ?? findByProps("setUploads", "addFiles", "popFirstFile");

const uploadsOf = (channelId: string): any[] => {
    const uploads = getStore("UploadAttachmentStore")?.getUploads?.(channelId, draftType());
    return Array.isArray(uploads) ? uploads : [];
};

const nameOf = (upload: any) => String(upload?.filename ?? upload?.item?.filename ?? upload?.item?.file?.name ?? "?").slice(0, 100);

function reorder(channelId: string) {
    const shown = uploadsOf(channelId).filter(isShown);
    if (shown.length < 2) return;
    choose(t("Reorder attachments"), shown.map((upload, i) => ({ label: `${i + 1}. ${nameOf(upload)}`, value: i, icon: "AttachmentIcon" })), from => {
        choose(nameOf(shown[from]), shown.map((_, to) => to).filter(to => to !== from).map(to => ({
            label: to === 0 ? t("Move to the start") : to === shown.length - 1 ? t("Move to the end") : t("Move to place {place}", { place: to + 1 }),
            value: to,
            icon: to < from ? "ArrowSmallUpIcon" : "ArrowSmallDownIcon",
        })), to => {
            try {
                // Taken again: a file may have been added or removed while the list was open
                const uploads = uploadsOf(channelId);
                const visible = uploads.filter(isShown);
                if (visible[from] !== shown[from] || visible.length !== shown.length) throw new Error(t("The files changed meanwhile; open the list again"));
                const actions = uploadActions();
                if (typeof actions?.setUploads !== "function") throw new Error(t("Discord's uploads weren't found"));
                actions.setUploads({ uploads: moveUpload(uploads, from, to), channelId, draftType: draftType() });
            } catch (e) {
                toastError(e);
            }
        });
    });
}

function ReorderButton() {
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        const stores = ["UploadAttachmentStore", "SelectedChannelStore"].map(name => getStore(name)).filter(Boolean);
        stores.forEach(store => store.addChangeListener?.(redraw));
        return () => stores.forEach(store => store.removeChangeListener?.(redraw));
    }, []);
    const channelId: string | undefined = getStore("SelectedChannelStore")?.getChannelId?.();
    const Button = getChatInputActionButton();
    const Icon = generatedIcon("ArrowsUpDownIcon");
    if (!channelId || uploadsOf(channelId).filter(isShown).length < 2 || !Button || !Icon) return null;
    return <Button accessibilityLabel={t("Reorder attachments")} IconComponent={Icon} onPress={() => reorder(channelId)} />;
}

export default definePlugin({
    id: "endcord.reorder-attachments",
    name: "ReorderAttachments",
    description: tx("Allows you to reorder attachments before sending them"),
    icon: "AttachmentIcon",
    tags: ["Chat", "Media"],
    start({ cleanup }) {
        if (typeof getStore("UploadAttachmentStore")?.getUploads !== "function" || typeof uploadActions()?.setUploads !== "function") {
            throw new Error(t("Discord's uploads weren't found"));
        }
        cleanup(addChatButton({ key: "reorder-attachments", side: () => "right", render: ReorderButton }));
    },
});
