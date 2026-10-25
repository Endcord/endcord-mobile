/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.accountpanelserverprofile

import android.content.Context
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.discord.databinding.WidgetUserStatusUpdateBinding
import com.discord.stores.StoreStream
import com.discord.utilities.color.ColorCompat
import com.discord.widgets.user.WidgetUserStatusSheet
import com.endcord.plugins.userscommon.UserSheets
import com.lytefast.flexinput.R
import java.lang.reflect.Method

/**
 * The Android app has no account panel. Its closest equivalent is the "You" tab: long-pressing it opens the status
 * sheet ([WidgetUserStatusSheet]). This adds an entry there that opens your own profile, as it looks in the server
 * you are in (or your plain profile outside servers).
 */
internal class AccountPanelServerProfile : EndcordPlugin(
    name = "AccountPanelServerProfile",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "servers")

    private val entryId = View.generateViewId()

    override fun start(context: Context) {
        patcher.after<WidgetUserStatusSheet>("onViewCreated", View::class.java, Bundle::class.java) { param ->
            try {
                addEntry(this, param.args[0] as View)
            } catch (e: Throwable) {
                logger.error("Failed to add the profile entry", e)
            }
        }
    }

    /** The list holding the status rows: the parent of the custom status row, else the scroll view's child. */
    private fun container(sheet: WidgetUserStatusSheet, root: View): LinearLayout? {
        try {
            val binding = bindingMethod.invoke(sheet) as WidgetUserStatusUpdateBinding
            (binding.b.parent as? LinearLayout)?.let { return it }
        } catch (e: Throwable) {
            logger.warn("Status sheet layout changed", e)
        }
        return (root as? ViewGroup)?.getChildAt(0) as? LinearLayout
    }

    private fun addEntry(sheet: WidgetUserStatusSheet, root: View) {
        val layout = container(sheet, root) ?: return
        layout.findViewById<View?>(entryId)?.let { layout.removeView(it) }

        val guildId = StoreStream.getGuildSelected().selectedGuildId.takeIf { it > 0L }
        val context = layout.context
        val entry = TextView(context, null, 0, R.i.UiKit_Settings_Item_Icon).apply {
            id = entryId
            text = I18n.t(if (guildId != null) "View server profile" else "View profile")
            ContextCompat.getDrawable(context, R.e.ic_account_circle_white_24dp)?.mutate()?.let {
                it.setTint(ColorCompat.getThemedColor(context, R.b.colorInteractiveNormal))
                setCompoundDrawablesRelativeWithIntrinsicBounds(it, null, null, null)
            }
            setOnClickListener {
                try {
                    val fragmentManager = sheet.parentFragmentManager
                    sheet.dismiss()
                    UserSheets.show(StoreStream.getUsers().me.id, guildId, fragmentManager)
                } catch (e: Throwable) {
                    logger.errorToast(I18n.t("Couldn't open your profile"), e)
                }
            }
        }
        layout.addView(entry)
    }

    private companion object {
        const val DESCRIPTION =
            "Long-press the You tab to view your profile in the current server from the status sheet"

        val bindingMethod: Method by lazy {
            WidgetUserStatusSheet::class.java.getDeclaredMethod("getBinding").apply { isAccessible = true }
        }
    }
}
