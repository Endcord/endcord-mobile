/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's NoNitroUpsell hides Nitro ads by making the client think you have Nitro. Here that would also make
 * Discord let you pick files too big to upload and emojis you can't send (and FakeNitro would stop turning them into
 * links), so this one doesn't touch what Discord thinks you have: it draws nothing in place of Discord's Nitro ad
 * banners, cards and buttons. The sheets that explain why something needs Nitro, when you try it, stay.
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { afterRender, moduleAt } from "../common";

/** Discord's components that only advertise Nitro: the file, and the export */
export const UPSELLS: ReadonlyArray<readonly [string, string]> = [
    // Profiles, and the profile editor's "try it out"
    ["modules/user_profile/native/UserProfileUpsellCard.tsx", "default"],
    ["modules/user_profile/native/UserProfileUpsellCardV2.tsx", "default"],
    ["modules/user_profile/native/UserProfileUpsellButton.tsx", "default"],
    ["modules/user_profile/native/UserProfilePremiumUpsellCard.tsx", "UserProfilePremiumUpsellCard"],
    ["modules/user_profile/native/UserProfileTryItOutGetPremiumUpsell.tsx", "default"],
    ["modules/user_profile/native/UserProfilePremiumTryItOutUpsell.tsx", "default"],
    // The shop, group DMs and the appearance settings
    ["modules/collectibles/native/ShopNitroUpsellBanner.tsx", "default"],
    ["modules/collectibles/native/ShopNitroUpsellBanner.tsx", "ShopNitroUpsellBanner"],
    ["modules/group_dm/native/GroupDMNitroUpsellBanner.tsx", "default"],
    ["modules/user_settings/appearance/native/components/SettingsAppearanceChannelListPreviewNitroUpsell.tsx", "default"],
    // Searching emojis and stickers, and the emoji suggestions while typing
    ["modules/emoji_picker/native/components/EmojiPickerPremiumSearchUpsell.tsx", "PremiumSearchUpsell"],
    ["modules/stickers/native/StickerPickerPremiumSearchUpsell.tsx", "default"],
    ["modules/channel_text_area/native/ChannelAutocompleteEmojiUpsell.tsx", "default"],
];

export default definePlugin({
    id: "endcord.no-nitro-upsell",
    name: "NoNitroUpsell",
    description: tx("Hides Discord's Nitro ads: the banners, cards and buttons that advertise Nitro around the app"),
    icon: "NitroWheelIcon",
    tags: ["Utility"],
    start({ cleanup, logger }) {
        let hidden = 0;
        for (const [path, key] of UPSELLS) {
            // The component still runs, so its hooks stay the same; what it draws is replaced by nothing. An after
            // patch keeps the original result for null, so an empty fragment it is
            const unpatch = afterRender(moduleAt(path), key, () => <></>);
            if (unpatch) {
                cleanup(unpatch);
                hidden++;
            } else logger.warn(`Nitro ad not found: ${path}`);
        }
        if (!hidden) throw new Error("Discord's Nitro ads weren't found");
    },
});
