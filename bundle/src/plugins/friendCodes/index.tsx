/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { findByProps } from "@metro";
import { Button, Stack } from "@metro/common/components";
import { useEffect, useState } from "react";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { copy } from "../hooks";
import LogList from "../ui/LogList";

function FriendCodesPage() {
    const [invites, setInvites] = useState<any[] | null>(null);
    const module = findByProps("createFriendInvite", "getAllFriendInvites");
    const refresh = () => module?.getAllFriendInvites?.().then(setInvites).catch(() => setInvites([]));
    useEffect(() => void refresh(), []);
    return <Stack spacing={8}>
        <LogList
            title={t("Your Friend Codes")}
            empty={invites === null ? t("Loading...") : t("You don't have any friend codes yet")}
            entries={(invites ?? []).map((i: any) => ({
                key: i.code,
                label: `discord.gg/${i.code}`,
                subLabel: `${t("Expires")}: ${new Date(i.expires_at).toLocaleString()} · ${t("Uses")}: ${i.uses ?? 0}/${i.max_uses}`,
                icon: "LinkIcon",
                onPress: () => copy(`https://discord.gg/${i.code}`),
            }))}
        />
        <Button text={t("Create Friend Code")} variant="primary" icon={findAssetId("PlusSmallIcon")} onPress={() => module?.createFriendInvite?.().then(refresh)} />
        {!!invites?.length && <Button text={t("Revoke all Friend Codes")} variant="destructive" icon={findAssetId("TrashIcon")} onPress={() => module?.revokeFriendInvites?.().then(refresh)} />}
    </Stack>;
}

export default definePlugin({
    id: "endcord.friend-codes",
    name: "FriendCodes",
    description: tx("Create and manage friend invite links in the plugin's settings, to add friends easily"),
    authors: [ENDCORD_AUTHOR],
    icon: "UserPlusIcon",
    tags: ["Friends"],
    SettingsComponent: FriendCodesPage,
    start() { },
});
