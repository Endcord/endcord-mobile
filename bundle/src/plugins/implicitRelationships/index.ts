/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findByProps } from "@metro";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import { botMessage, command } from "../hooks";

export default definePlugin({
    id: "endcord.implicit-relationships",
    name: "ImplicitRelationships",
    description: tx("See the people Discord thinks you talk to most, even if they aren't your friends, with /implicit"),
    authors: [ENDCORD_AUTHOR],
    icon: "FriendsIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        cleanup(command({
            name: "implicit",
            description: tx("People you talk to a lot who aren't your friends"),
            run: async (_, ctx) => {
                // UserAffinitiesV2Store since Discord 350; Discord fetches them only for some screens
                const affinityStore = getStore("UserAffinitiesV2Store") ?? getStore("UserAffinitiesStore");
                if (affinityStore?.shouldFetch?.()) {
                    await Promise.resolve(findByProps("fetchUserAffinitiesV2")?.fetchUserAffinitiesV2?.()).catch(() => { });
                }
                const affinities: any[] = affinityStore?.getUserAffinities?.() ?? [];
                const relationships = getStore("RelationshipStore");
                const me = currentUserId();
                const ids = affinities
                    .map(a => String(a?.user_id ?? a?.otherUserId ?? a?.userId ?? ""))
                    .filter(id => id && id !== me && !relationships?.isFriend?.(id))
                    .slice(0, 25);
                botMessage(ctx.channel.id, ids.length ? ids.map((id, i) => `${i + 1}. <@${id}>`).join("\n") : t("Discord hasn't told the app about anyone yet."));
            },
        }));
    },
});
