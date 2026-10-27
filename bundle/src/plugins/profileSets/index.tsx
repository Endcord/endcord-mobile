/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { Button, Stack } from "@metro/common/components";

import { definePlugin } from "../api";
import { currentUserId, getStore } from "../common";
import { api, describeError, getUser } from "../hooks";
import { preview } from "../shared/account";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";

interface ProfilePreset {
    name: string;
    globalName?: string;
    bio?: string;
    pronouns?: string;
}

const presets = wrapSync(createStorage<{ items: ProfilePreset[]; }>(createMMKVBackend("ENDCORD_PROFILE_SETS", { items: [] })));

const presetList = () => Array.isArray(presets.items) ? presets.items : [];

async function applyProfile(preset: ProfilePreset) {
    await api("patch", "/users/@me/profile", { bio: preset.bio ?? "", pronouns: preset.pronouns ?? "" });
    if (preset.globalName !== undefined) await api("patch", "/users/@me", { global_name: preset.globalName || null });
}

function ProfileSetsPage() {
    useProxy(presets);
    const save = () => prompt({
        title: t("Save Current Profile"),
        placeholder: t("Preset name"),
        onSubmit: name => {
            const me = currentUserId();
            const profile = me ? getStore("UserProfileStore")?.getUserProfile?.(me) : undefined;
            const user = me ? getUser(me) : undefined;
            presets.items = [...presetList(), { name: name.trim(), globalName: user?.globalName ?? "", bio: profile?.bio ?? "", pronouns: profile?.pronouns ?? "" }];
        },
    });
    return <Stack spacing={8}>
        <LogList
            title={t("Profile Presets")}
            empty={t("Save your display name, About Me and pronouns to switch back to them in one tap")}
            entries={presetList().map((p, i) => ({
                key: String(i),
                label: p.name,
                subLabel: preview([p.globalName, p.pronouns, p.bio].filter(Boolean).join(" · "), 90),
                onPress: () => choose(p.name, [
                    { label: t("Apply"), value: "apply", icon: "CheckmarkLargeIcon" },
                    { label: t("Delete"), value: "delete", icon: "TrashIcon", danger: true },
                ], action => {
                    if (action === "delete") presets.items = presetList().filter((_, j) => j !== i);
                    else applyProfile(p)
                        .then(() => showToast(t("Profile updated"), findAssetId("CheckmarkLargeIcon")))
                        .catch(e => showToast(t("Request failed: {error}", { error: describeError(e) }), findAssetId("CircleXIcon-primary")));
                }),
            }))}
        />
        <Button text={t("Save Current Profile")} variant="secondary" icon={findAssetId("PlusSmallIcon")} onPress={save} />
    </Stack>;
}

export default definePlugin({
    id: "endcord.profile-sets",
    name: "ProfileSets",
    description: tx("Allows you to save and load different profile presets."),
    icon: "UserCircleIcon",
    tags: ["Customisation"],
    SettingsComponent: ProfileSetsPage,
    async start() {
        await awaitStorage(presets);
    },
});
