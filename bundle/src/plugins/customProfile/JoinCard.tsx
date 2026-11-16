/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Profiles are shared through the Endcord server: someone who isn't in it sees nobody's and shares nothing, and without
 * this card nothing would say so. Shown in the plugin's settings and the editor until the server is joined.
 */

import { t } from "@core/i18n";
import { FluxUtils } from "@metro/common";
import { Button, Stack, Text } from "@metro/common/components";

import { getStore } from "../common";
import { openProfilesInvite } from "./publish";
import { isInProfilesServer } from "./sharing";

/** Whether this account is in the Endcord server, kept current: the card goes as soon as the server is joined */
function useInProfilesServer(): boolean {
    const guilds = getStore("GuildStore");
    return FluxUtils.useStateFromStores(guilds ? [guilds] : [], () => isInProfilesServer());
}

export default function JoinCard() {
    if (useInProfilesServer()) return null;
    return <Stack spacing={8}>
        <Text variant="text-sm/medium" color="text-muted">{t("Join the Endcord server to see the profiles other Endcord users made, and to share yours with them.")}</Text>
        <Button text={t("Join the server")} variant="secondary" onPress={() => void openProfilesInvite()} />
    </Stack>;
}
