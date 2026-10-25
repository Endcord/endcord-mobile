/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.inrole;

import androidx.fragment.app.FragmentManager;

import com.discord.widgets.user.usersheet.WidgetUserSheet;

/**
 * Opens a user's profile sheet. Written in Java because the Kotlin metadata of WidgetUserSheet's companion is
 * stripped in Discord's jar, which hides its show() overloads from Kotlin.
 */
final class UserSheet {
    private UserSheet() {}

    static void show(long userId, Long guildId, FragmentManager fragmentManager) {
        WidgetUserSheet.Companion.show(userId, null, fragmentManager, guildId);
    }
}
