/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's NoDraftLengthLimit: Discord cuts what it saves of a message box to 4500 characters, so a long text
 * (to split with SplitLargeMessages, say) loses its end when you leave the chat. PC changes the limit in Discord's
 * code; a phone can't, so the whole text of long drafts is kept here, as each one is written, and DraftStore gives
 * it back instead of the cut one. It stays on the phone, like Discord's own drafts, and is cleared when the plugin
 * stops.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { after } from "@lib/api/patcher";

import { definePlugin } from "../api";
import { getStore, onAction } from "../common";
import { draftKey, fullDraft, rememberDraft } from "./keep";

const storage = wrapSync(createStorage<{ drafts: Record<string, string>; }>(createMMKVBackend("ENDCORD_FULL_DRAFTS", { drafts: {} })));

/** Saved a moment after the last change, rather than at every letter typed */
const SAVE_DELAY = 2000;

export default definePlugin({
    id: "endcord.no-draft-length-limit",
    name: "NoDraftLengthLimit",
    description: tx("Removes the 4500 character saved draft message truncation"),
    icon: "TextIcon",
    tags: ["Chat", "Utility"],
    async start({ cleanup }) {
        const draftStore = getStore("DraftStore");
        if (typeof draftStore?.getDraft !== "function") throw new Error(t("Discord's drafts weren't found"));
        await awaitStorage(storage);

        let kept: Record<string, string> = { ...(storage.drafts ?? {}) };
        let saveTimer: ReturnType<typeof setTimeout> | undefined;
        const save = () => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => storage.drafts = kept, SAVE_DELAY);
        };
        const written = (payload: any) => {
            if (typeof payload?.channelId !== "string") return;
            const key = draftKey(payload.channelId, payload.draftType);
            const next = rememberDraft(kept, key, payload.draft);
            if (next[key] === kept[key] && Object.keys(next).length === Object.keys(kept).length) return;
            kept = next;
            save();
        };

        cleanup(
            // Typing (DRAFT_CHANGE) and leaving the chat (DRAFT_SAVE) carry the whole text, before DraftStore cuts it
            onAction("DRAFT_CHANGE", written),
            onAction("DRAFT_SAVE", written),
            onAction("DRAFT_CLEAR", payload => written({ ...payload, draft: "" })),
            // Forgotten on the phone right away, not a moment later: the app is often closed just after logging out
            onAction("LOGOUT", () => {
                clearTimeout(saveTimer);
                kept = {};
                storage.drafts = {};
            }),
            after("getDraft", draftStore, ([channelId, draftType], draft) => {
                if (typeof channelId !== "string") return draft;
                return fullDraft(draft, kept[draftKey(channelId, draftType)]);
            }),
            () => {
                clearTimeout(saveTimer);
                kept = {};
                storage.drafts = {};
            },
        );
    },
});
