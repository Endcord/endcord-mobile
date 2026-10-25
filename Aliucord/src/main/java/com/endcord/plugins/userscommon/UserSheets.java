/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.userscommon;

import android.content.Context;

import androidx.annotation.Nullable;
import androidx.fragment.app.FragmentManager;

import com.discord.widgets.servers.WidgetServerSettingsEditRole;
import com.discord.widgets.user.usersheet.WidgetUserSheet;

/**
 * Opens Discord screens whose launchers live on companion objects. Written in Java because the Kotlin metadata
 * of those companions is stripped in Discord's jar, which hides their methods from Kotlin.
 */
public final class UserSheets {
    private UserSheets() {}

    /** Opens the profile sheet of [userId], with their server profile of [guildId] if given. */
    public static void show(long userId, @Nullable Long guildId, FragmentManager fragmentManager) {
        WidgetUserSheet.Companion.show(userId, null, fragmentManager, guildId);
    }

    /** Opens the server settings page that edits a role. */
    public static void editRole(long guildId, long roleId, Context context) {
        WidgetServerSettingsEditRole.Companion.launch(guildId, roleId, context);
    }
}
