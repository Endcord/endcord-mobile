/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.permissionfreewill

import android.content.Context
import com.aliucord.patcher.after
import com.aliucord.patcher.instead
import com.discord.views.TernaryCheckBox
import com.discord.widgets.channels.permissions.WidgetChannelSettingsEditPermissions
import com.discord.widgets.channels.permissions.WidgetChannelSettingsEditPermissionsModel
import com.endcord.plugins.guildscommon.GuildsPlugin
import de.robv.android.xposed.XC_MethodHook

internal class PermissionFreeWill : GuildsPlugin(
    name = "PermissionFreeWill",
    description = "Disables the client-side restrictions for channel permission management.",
) {
    override val tags = listOf("servers", "utility")

    private val inSetup = ThreadLocal<Boolean>()

    override fun start(context: Context) {
        // Lockout checks for roles you have: Discord greys out denying or clearing a permission you'd lose yourself.
        patcher.instead<WidgetChannelSettingsEditPermissionsModel.ModelForRole>("canDenyRolePermission", Long::class.javaPrimitiveType!!) { true }
        patcher.instead<WidgetChannelSettingsEditPermissionsModel.ModelForRole>("canNeutralizeRolePermission", Long::class.javaPrimitiveType!!) { true }

        // The same check for your own member overwrite, which keys off isMe() while the checkboxes are set up.
        val setup = WidgetChannelSettingsEditPermissions::class.java.getDeclaredMethod(
            "setupPermissionEnabledState",
            TernaryCheckBox::class.java, Long::class.javaPrimitiveType!!, WidgetChannelSettingsEditPermissionsModel::class.java,
        )
        patcher.patch(setup, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) = inSetup.set(true)
            override fun afterHookedMethod(param: MethodHookParam) = inSetup.set(false)
        })
        patcher.after<WidgetChannelSettingsEditPermissionsModel.ModelForUser>("isMe") { param ->
            if (inSetup.get() == true) param.result = false
        }
    }
}
