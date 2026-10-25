/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.betterblockedusers

import android.content.Context
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.aliucord.utils.DimenUtils.dp
import com.discord.widgets.settings.account.WidgetSettingsBlockedUsers
import com.discord.widgets.settings.account.WidgetSettingsBlockedUsersViewModel
import com.endcord.plugins.userscommon.Users
import java.lang.reflect.Method
import java.util.Locale
import java.util.WeakHashMap

internal class BetterBlockedUsers : EndcordPlugin(
    name = "BetterBlockedUsers",
    description = "Allows you to search in the blocked users list.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "shortcuts")

    private val searchViewId = View.generateViewId()

    /** The unfiltered list each open page last received, and what is being searched on it. */
    private val lastStates = WeakHashMap<WidgetSettingsBlockedUsers, WidgetSettingsBlockedUsersViewModel.ViewState.Loaded>()
    private val queries = WeakHashMap<WidgetSettingsBlockedUsers, String>()

    private val mShowBlockedUsers: Method by lazy {
        WidgetSettingsBlockedUsers::class.java.getDeclaredMethod(
            "showBlockedUsers",
            WidgetSettingsBlockedUsersViewModel.ViewState.Loaded::class.java,
        ).apply { isAccessible = true }
    }

    override fun start(context: Context) {
        patcher.after<WidgetSettingsBlockedUsers>("onViewCreated", View::class.java, Bundle::class.java) { param ->
            try {
                addSearch(this, param.args[0] as View)
            } catch (e: Throwable) {
                this@BetterBlockedUsers.logger.error("Failed to add the blocked users search", e)
            }
        }

        patcher.before<WidgetSettingsBlockedUsers>(
            "showBlockedUsers",
            WidgetSettingsBlockedUsersViewModel.ViewState.Loaded::class.java,
        ) { param ->
            try {
                val state = param.args[0] as WidgetSettingsBlockedUsersViewModel.ViewState.Loaded
                lastStates[this] = state
                val query = queries[this]
                if (query.isNullOrEmpty()) return@before
                param.args[0] = WidgetSettingsBlockedUsersViewModel.ViewState.Loaded(state.items.filter { matches(it, query) })
            } catch (e: Throwable) {
                this@BetterBlockedUsers.logger.error("Failed to filter blocked users", e)
            }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        lastStates.clear()
        queries.clear()
    }

    private fun addSearch(fragment: WidgetSettingsBlockedUsers, root: View) {
        // The page is a CoordinatorLayout whose first child is the app bar (a vertical LinearLayout)
        val appBar = (root as? ViewGroup)?.getChildAt(0) as? LinearLayout ?: return
        if (appBar.findViewById<View?>(searchViewId) != null) return
        val ctx = appBar.context
        val input = EditText(ctx).apply {
            id = searchViewId
            hint = I18n.t("Search users...")
            inputType = InputType.TYPE_CLASS_TEXT
            setSingleLine()
            setText(queries[fragment] ?: "")
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    queries[fragment] = s?.toString()?.trim()?.lowercase(Locale.ROOT) ?: ""
                    val state = lastStates[fragment] ?: return
                    try {
                        mShowBlockedUsers.invoke(fragment, state)
                    } catch (e: Throwable) {
                        logger.error("Failed to refresh blocked users", e)
                    }
                }
            })
        }
        val params = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            setMargins(16.dp, 0, 16.dp, 8.dp)
        }
        appBar.addView(input, params)
    }

    private fun matches(item: WidgetSettingsBlockedUsersViewModel.Item, query: String): Boolean {
        val user = item.user ?: return false
        if (user.id.toString() == query) return true
        if (user.username.lowercase(Locale.ROOT).contains(query)) return true
        return Users.displayName(user).lowercase(Locale.ROOT).contains(query)
    }
}
