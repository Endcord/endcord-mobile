/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * The part of Endcord PC's Questify that hides Quests: its "Disable all Quest features" and its Quest badge setting.
 * Questify's automatic Quest completion isn't here, and never will be: it tells Discord you played or watched
 * something you didn't, which Discord bans for.
 *
 * Discord for Android draws every Quest promotion (the Quest bar, Quest icons in member lists and activities, the
 * Quests page) from its QuestStore. Quests that load are kept out of it, and a Quest asked for by id isn't there, so
 * nothing promotes one. Turning this off loads them again.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin, onSettingChange } from "../api";
import { getStore, moduleAt, onAction } from "../common";
import { extendProfileBadges } from "../profileBadges";

/** The profile badges Quests and Orbs give, as Endcord PC names them */
export const QUEST_BADGES: ReadonlySet<string> = new Set(["quest_completed", "orb_profile_badge"]);

export const withoutQuestBadges = (badges: any[]) => badges.filter(b => !QUEST_BADGES.has(b?.id));

export default definePlugin({
    id: "endcord.questify",
    name: "Questify",
    description: tx("Hides Discord's Quests and their promotions, and the Quest badges on profiles. Never completes Quests for you."),
    icon: "EyeSlashIcon",
    tags: ["Appearance", "Privacy", "Utility"],
    settings: {
        hideQuests: { type: "boolean", label: tx("Disable all Quest features."), description: tx("The Quest bar, Quest icons in lists and activities, and the Quests page"), default: true },
        hideBadges: { type: "boolean", label: tx("Disable the Quest badge on user profiles."), default: true },
    },
    start({ store, cleanup, logger }) {
        const quests = getStore("QuestStore");
        const actions = moduleAt("modules/quests/QuestActionCreators.tsx");
        if (typeof quests?.getQuest !== "function") throw new Error("Discord's Quests weren't found");

        /** Has Discord load the Quests again, so hiding them or bringing them back shows right away */
        const reload = () => {
            try {
                Promise.resolve(actions?.fetchCurrentQuests?.()).catch(e => logger.warn("Couldn't load the Quests again", e));
            } catch (e) {
                logger.warn("Couldn't load the Quests again", e);
            }
        };

        cleanup(
            onAction<{ quests?: unknown; }>("QUESTS_FETCH_CURRENT_QUESTS_SUCCESS", payload => {
                if (store.hideQuests && Array.isArray(payload.quests)) return { quests: [] };
            }),
            // Instead rather than after: an after patch keeps Discord's result when it gives nothing
            instead("getQuest", quests, function (this: any, args, original) {
                return store.hideQuests ? undefined : original.apply(this, args);
            }),
        );
        try {
            cleanup(extendProfileBadges("questify", (_, badges) => store.hideBadges ? withoutQuestBadges(badges) : badges));
        } catch (e) {
            logger.warn("Quest badges will still show", e);
        }

        const refresh = () => {
            reload();
            try {
                quests.emitChange?.();
            } catch { }
        };
        if (store.hideQuests) refresh();
        cleanup(
            onSettingChange(store, key => key === "hideQuests" && refresh()),
            // Back as Discord has them
            () => setTimeout(refresh, 0),
        );
    },
});
