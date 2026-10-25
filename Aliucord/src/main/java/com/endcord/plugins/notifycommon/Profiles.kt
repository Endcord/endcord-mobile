/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.notifycommon

import android.content.Context

/** Kotlin entry point for [UserProfile]. */
internal object Profiles {
    fun open(context: Context, userId: Long) = UserProfile.open(context, userId)
}
