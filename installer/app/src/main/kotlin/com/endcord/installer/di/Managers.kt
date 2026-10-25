package com.endcord.installer.di

import android.content.Context
import com.endcord.installer.manager.PreferencesManager
import org.koin.core.scope.Scope

fun Scope.providePreferences(): PreferencesManager {
    val ctx: Context = get()
    return PreferencesManager(ctx.getSharedPreferences("preferences", Context.MODE_PRIVATE))
}
