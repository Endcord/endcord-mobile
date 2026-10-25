/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notifycommon;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;

import androidx.fragment.app.FragmentActivity;

import com.aliucord.Utils;
import com.discord.widgets.user.usersheet.WidgetUserSheet;

/**
 * Opens a user's profile sheet. Written in Java because the Kotlin metadata of WidgetUserSheet's companion is
 * stripped in Discord's jar, which hides its show() overloads from Kotlin.
 */
final class UserProfile {
    private UserProfile() {}

    static void open(Context context, long userId) {
        FragmentActivity activity = findActivity(context);
        if (activity == null) {
            try {
                activity = Utils.appActivity;
            } catch (Throwable ignored) {
                return;
            }
        }
        if (activity == null) return;
        WidgetUserSheet.Companion.show(userId, null, activity.getSupportFragmentManager(), null);
    }

    private static FragmentActivity findActivity(Context context) {
        Context current = context;
        while (current instanceof ContextWrapper) {
            if (current instanceof FragmentActivity) return (FragmentActivity) current;
            if (current instanceof Activity) return null;
            current = ((ContextWrapper) current).getBaseContext();
        }
        return null;
    }
}
