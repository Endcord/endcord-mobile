/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * After a save or a reset: shares the profile with other Endcord users, as Endcord PC does, and says so when it couldn't
 * be. The profile itself is always saved on this phone first.
 */

import { t } from "@core/i18n";
import { showConfirmationAlert } from "@core/vendetta/alerts";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { openSafeLink } from "@lib/utils/externalLinks";
import { invites } from "@metro/common";

import { moduleAt } from "../common";
import type { CustomProfileData } from "./data";
import { PROFILES_GUILD_ID, PROFILES_INVITE, PROFILES_INVITE_CODE, publishProfile, sharingRetryAt, takeNotMemberWarning } from "./sharing";
import { currentSharable } from "./store";

const failureIcon = () => findAssetId("CircleXIcon-primary");

/**
 * Opens the Endcord server's invite in Discord itself, as a tapped invite link does, where joining is one tap and the
 * person stays in this app. As on Endcord PC, only once the invite is seen to lead to the Endcord server: a vanity link
 * goes back on the market when a server loses its boosts, and then it could lead anywhere
 */
export async function openProfilesInvite() {
    try {
        const { invite } = await invites.resolveInvite(PROFILES_INVITE_CODE, "Mobile Modal") ?? {};
        if (invite?.guild?.id !== PROFILES_GUILD_ID) {
            showToast(t("The Endcord server's invite doesn't lead to it right now. Try again later."), failureIcon());
            return;
        }
        // Discord's own link handling: an invite opens its join screen here instead of leaving for the browser
        const linking = moduleAt("lib/native/Linking.tsx")?.default;
        if (typeof linking?.openURL === "function") {
            await linking.openURL(PROFILES_INVITE);
            return;
        }
    } catch (err) {
        // Not checked, so not opened: offline, or Discord changed how invites are looked up
        console.error("[Endcord] CustomProfile couldn't look up the Endcord server's invite", err);
        showToast(t("Couldn't open the Endcord server's invite. Try again in a moment."), failureIcon());
        return;
    }
    // Checked above: the link itself gets there too
    await openSafeLink(PROFILES_INVITE).catch(() => { });
}

/** Shares the saved profile with other Endcord users, and says so when it couldn't be */
export async function shareMyProfile(myId: string, data: CustomProfileData | null) {
    const result = await publishProfile(myId, data);
    if (result === "not-member") {
        // Once: someone who chose not to join isn't asked again on every save
        if (!data || !await takeNotMemberWarning()) return;
        showConfirmationAlert({
            title: t("Only you can see this profile for now"),
            content: t("Endcord users see each other's profiles through the Endcord Discord server. Join it, and everyone using Endcord sees your profile too."),
            confirmText: t("Join the server"),
            cancelText: t("Not now"),
            onConfirm: () => void openProfilesInvite(),
        });
    } else if (result === "too-long") {
        showToast(t("Your profile is too long to share. Shorten it a little and save again."), failureIcon());
    } else if (result === "later") {
        // The profiles channel takes one message per person every few minutes; this save goes out when it may
        const minutes = Math.max(1, Math.ceil((sharingRetryAt() - Date.now()) / 60_000));
        showToast(t("Saved. Other Endcord users see this change in {minutes} min.", { minutes }), findAssetId("ClockIcon"));
    } else if (result === "published-without-pictures") {
        showToast(t("Shared without the pictures you picked: they couldn't be uploaded. Save again to try once more."), failureIcon());
    } else if (result === "failed") {
        showToast(data
            ? t("Couldn't share your profile with other Endcord users. It's saved, and it's shared the next time you save.")
            : t("Couldn't take your profile back from other Endcord users yet. It's tried again the next time Discord connects."), failureIcon());
    }
}

/**
 * Asks once whether to share a profile saved before profiles were shared, when the editor still said only you see it:
 * it's never shared without being asked
 */
export function offerToShare(myId: string) {
    showConfirmationAlert({
        title: t("Share your custom profile?"),
        content: t("Endcord users now see each other's custom profiles. Yours is only on this phone so far: share it, and everyone using Endcord sees it too, without your email, phone and account creation date."),
        confirmText: t("Share it"),
        cancelText: t("Not now"),
        onConfirm: () => {
            // What's saved when the answer comes, and only while that account is still the one signed in
            const mine = currentSharable();
            if (mine?.id === myId && mine.data) shareMyProfile(myId, mine.data).catch(e => console.error("[Endcord] CustomProfile couldn't share the profile", e));
        },
    });
}
