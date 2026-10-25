/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.registry

import com.aliucord.entities.EndcordPlugin
import com.endcord.plugins.bypasspinprompt.BypassPinPrompt
import com.endcord.plugins.doubleclickedit.DoubleClickEdit
import com.endcord.plugins.exportdm.ExportDM
import com.endcord.plugins.expressioncloner.ExpressionCloner
import com.endcord.plugins.fakemessage.FakeMessage
import com.endcord.plugins.guildpickerdumper.GuildPickerDumper
import com.endcord.plugins.messageclickactions.MessageClickActions
import com.endcord.plugins.profilemedia.ProfileMedia
import com.endcord.plugins.translate.Translate
import com.endcord.plugins.viewicons.ViewIcons

internal fun batch08(): List<EndcordPlugin> = listOf(
    BypassPinPrompt(),
    DoubleClickEdit(),
    ExportDM(),
    ExpressionCloner(),
    FakeMessage(),
    GuildPickerDumper(),
    MessageClickActions(),
    ProfileMedia(),
    Translate(),
    ViewIcons(),
)
