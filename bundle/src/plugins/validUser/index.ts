/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's ValidUser: a mention of someone Discord hasn't seen yet shows as "@unknown-user" until that person is
 * looked up. PC looks them up when the pointer goes over the mention; a phone has no pointer, so here it is "Load
 * Mentioned Users" in the message's long-press menu, shown only when the message mentions someone Discord doesn't
 * know. As on PC, each person is fetched from Discord's API one after another, a moment apart, waiting when Discord
 * asks to, and handed to Discord as a user update (by Discord's own getUser, which does both, where it has it); the
 * message is then drawn again with their names. PC also fills in the badges of a profile Discord hasn't loaded; on
 * the phone, opening a profile loads the real one.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { dispatchSoon, getStore, moduleAt } from "../common";
import { addMessageAction, api, describeError, onMessageRow, redrawMessage } from "../hooks";
import { sleep } from "../shared/tools";
import { retryDelay, unknownMentions } from "./mentions";

/** PC's pause between two lookups */
const PAUSE = 300;

const known = (id: string) => !!getStore("UserStore")?.getUser?.(id);

export default definePlugin({
    id: "endcord.valid-user",
    name: "ValidUser",
    description: tx("Fix mentions for unknown users showing up as '@unknown-user' (long-press the message and choose Load Mentioned Users)"),
    icon: "UserIcon",
    tags: ["Chat", "Utility"],
    start({ cleanup }) {
        let running = true;
        /** People being looked up, so pressing again doesn't fetch them twice */
        const fetching = new Set<string>();

        // Discord's own way to fetch someone it doesn't know, which hands them to its stores as PC does
        const users = moduleAt("actions/UserActionCreators.tsx");

        /** Someone's public profile from Discord, handed to Discord; false when there's no such account */
        async function lookUp(id: string): Promise<boolean> {
            for (let attempt = 0; ; attempt++) {
                try {
                    const result = typeof users?.getUser === "function" ? await users.getUser(id) : await api("get", `/users/${id}`);
                    if (known(id)) return true;
                    const user = result?.body ?? result;
                    if (user?.id !== id) return false;
                    if (running) dispatchSoon({ type: "USER_UPDATE", user });
                    return true;
                } catch (e: any) {
                    if (e?.status === 429 && attempt < 2 && running) {
                        await sleep(retryDelay(e));
                        continue;
                    }
                    if (e?.status === 404) return false;
                    throw e;
                }
            }
        }

        cleanup(
            () => {
                running = false;
                fetching.clear();
            },
            // Rows drawn again for the message are sent to the chat although the message itself didn't change
            onMessageRow("valid-user", () => { }),
            addMessageAction({
                key: "valid-user",
                icon: "UserIcon",
                label: () => t("Load Mentioned Users"),
                visible: message => unknownMentions(message.content, id => known(id) || fetching.has(id)).length > 0,
                onPress: async message => {
                    const ids = unknownMentions(message.content, id => known(id) || fetching.has(id));
                    ids.forEach(id => fetching.add(id));
                    let found = 0, gone = 0;
                    let error: unknown;
                    try {
                        for (const [i, id] of ids.entries()) {
                            if (!running) return;
                            if (i) await sleep(PAUSE);
                            if (await lookUp(id)) found++;
                            else gone++;
                        }
                    } catch (e) {
                        error = e;
                    } finally {
                        ids.forEach(id => fetching.delete(id));
                    }
                    if (!running) return;
                    if (found) redrawMessage(message.channel_id, message.id);
                    if (error) showToast(t("Couldn't load everyone mentioned: {error}", { error: describeError(error) }), findAssetId("CircleXIcon-primary"));
                    else if (gone) showToast(t("Some of the people mentioned don't have an account anymore"), findAssetId("CircleInformationIcon-primary"));
                },
            }),
        );
    },
});
