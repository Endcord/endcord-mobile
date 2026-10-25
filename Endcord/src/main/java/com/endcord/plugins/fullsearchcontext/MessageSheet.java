/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.fullsearchcontext;

import androidx.fragment.app.FragmentManager;

import com.discord.widgets.chat.list.actions.WidgetChatListActions;

/**
 * Opens Discord's message long-press sheet. Written in Java because the Kotlin metadata of
 * {@code WidgetChatListActions.Companion} is stripped in Discord's jar, which hides its methods from Kotlin.
 */
final class MessageSheet {
    private MessageSheet() {}

    static void show(FragmentManager fragmentManager, long channelId, long messageId, CharSequence formattedMessage) {
        WidgetChatListActions.Companion.showForChat(fragmentManager, channelId, messageId, formattedMessage);
    }
}
