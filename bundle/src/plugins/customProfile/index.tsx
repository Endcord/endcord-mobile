/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { after, before } from "@lib/api/patcher";
import { findByName } from "@metro";
import { Text } from "@metro/common/components";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore, moduleAt } from "../common";

const MESSAGE_ROW = 1;

const plugin = definePlugin({
    id: "endcord.custom-profile",
    name: "CustomProfile",
    description: tx("Visually customize your Discord profile (username, PFP, banner, badges, bio...) — persistent, only visible to you."),
    authors: [ENDCORD_AUTHOR],
    popular: 1,
    icon: "UserCircleIcon",
    settings: {
        displayName: { type: "string", label: tx("Display name"), placeholder: tx("Leave empty to keep your own"), default: "" },
        avatarUrl: { type: "string", label: tx("Avatar image link"), placeholder: "https://…", default: "" },
        bannerUrl: { type: "string", label: tx("Banner image link"), placeholder: "https://…", default: "" },
        pronouns: { type: "string", label: tx("Pronouns"), placeholder: tx("Leave empty to keep your own"), default: "" },
        bio: { type: "string", label: tx("About me"), placeholder: tx("Leave empty to keep your own"), multiline: true, default: "" },
    },
    start({ store, cleanup, logger }) {
        const isMe = (id?: string) => !!id && id === currentUserId();
        const validUrl = (url: string) => /^https?:\/\/\S+$/.test(url.trim()) ? url.trim() : "";

        // Avatars: every user record shares a prototype, so the patch checks whose avatar is asked for
        const me = getStore("UserStore")?.getCurrentUser?.();
        const userProto = me && Object.getPrototypeOf(me);
        const patchProto = (proto: any) => {
            if (!proto) return;
            if (typeof proto.getAvatarURL === "function") cleanup(after("getAvatarURL", proto, function (this: any, _, ret) {
                const url = validUrl(store.avatarUrl);
                return url && isMe(this?.id) ? url : ret;
            }));
            if (typeof proto.getAvatarSource === "function") cleanup(after("getAvatarSource", proto, function (this: any, _, ret) {
                const url = validUrl(store.avatarUrl);
                return url && isMe(this?.id) ? { uri: url } : ret;
            }));
        };
        if (userProto) patchProto(userProto);
        else {
            // Not logged in yet: patch once the account has loaded
            const UserStore = getStore("UserStore");
            const wait = setInterval(() => {
                const user = UserStore?.getCurrentUser?.();
                if (!user) return;
                clearInterval(wait);
                patchProto(Object.getPrototypeOf(user));
            }, 2000);
            cleanup(() => clearInterval(wait));
        }

        // Bio and pronouns, where profiles are read. The same profile gets the same copy back, so screens that compare
        // what the store returns don't redraw for nothing.
        let cached: { source: any; key: string; copy: any; } | null = null;
        const profiles = getStore("UserProfileStore");
        if (profiles?.getUserProfile) cleanup(after("getUserProfile", profiles, ([id], profile) => {
            if (!profile || !isMe(id) || (!store.bio.trim() && !store.pronouns.trim())) return;
            const key = JSON.stringify([store.bio, store.pronouns]);
            let entry = cached;
            if (!entry || entry.source !== profile || entry.key !== key) {
                const copy = { ...profile };
                if (store.bio.trim()) copy.bio = store.bio;
                if (store.pronouns.trim()) copy.pronouns = store.pronouns.trim();
                entry = cached = { source: profile, key, copy };
            }
            return entry.copy;
        }));

        // Display name on your messages
        const RowManager = findByName("RowManager");
        if (RowManager?.prototype?.generate) cleanup(after("generate", RowManager.prototype, ([args], row) => {
            const name = store.displayName.trim();
            if (!name || row?.type !== MESSAGE_ROW || !isMe(args?.message?.author?.id) || !row.message) return;
            if (typeof row.message.username === "string") row.message.username = name;
            const avatar = validUrl(store.avatarUrl);
            if (avatar && typeof row.message.avatarURL === "string") row.message.avatarURL = avatar;
        }));

        // Banner, where the profile shows it
        const banner = findByName("ProfileBanner", false) ?? moduleAt("modules/user_profile/native/UserProfileBanner.tsx");
        if (banner?.default) cleanup(before("default", banner, args => {
            const url = validUrl(store.bannerUrl);
            const props = args[0];
            const user = props?.user ?? props?.displayProfile;
            if (!url || !props || !isMe(user?.id ?? user?.userId)) return;
            return [{ ...props, bannerSource: { uri: url } }, ...args.slice(1)];
        }));
        else logger.warn("Profile banners not found");
    },
    SettingsComponent: () => <Text variant="text-sm/medium" color="text-muted">
        {t("Only you see these changes. Clear them before you edit your real profile, so they don't end up in it.")}
    </Text>,
});

export default plugin;
