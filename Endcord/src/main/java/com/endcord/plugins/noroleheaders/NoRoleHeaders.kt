/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.noroleheaders

import android.content.Context
import android.view.View
import android.view.ViewGroup
import com.aliucord.patcher.after
import com.discord.widgets.channels.memberlist.WidgetChannelMembersListViewModel
import com.discord.widgets.channels.memberlist.adapter.ChannelMembersListAdapter
import com.discord.widgets.channels.memberlist.adapter.ChannelMembersListViewHolderRoleHeader
import com.endcord.plugins.guildscommon.GuildsPlugin
import java.lang.reflect.Field
import java.util.Collections
import java.util.WeakHashMap

internal class NoRoleHeaders : GuildsPlugin(
    name = "NoRoleHeaders",
    description = "We are all equal!! Removes the role headers in the member list.",
) {
    override val tags = listOf("appearance", "fun")

    /** Header rows we collapsed, so they can be shown again when the plugin stops. */
    private val collapsed: MutableSet<View> = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap()))

    override fun start(context: Context) {
        // The member list is loaded in ranges by row position, so rows can't be removed: collapse them instead.
        patcher.after<ChannelMembersListViewHolderRoleHeader>("bind", ChannelMembersListAdapter.Item.RoleHeader::class.java) {
            try {
                val view = itemView
                view.layoutParams = view.layoutParams?.apply { height = 0 }
                view.visibility = View.GONE
                collapsed += view
            } catch (e: Throwable) {
                logger.error("Failed to hide a role header", e)
            }
        }

        // ...and keep them from showing up as the sticky header at the top of the list.
        patcher.after<ChannelMembersListAdapter>("isHeader", Int::class.javaPrimitiveType!!) { param ->
            if (param.result == true && itemAt(this, param.args[0] as Int) is ChannelMembersListAdapter.Item.RoleHeader) {
                param.result = false
            }
        }
        patcher.after<ChannelMembersListAdapter>("getHeaderPositionForItem", Int::class.javaPrimitiveType!!) { param ->
            val position = param.result as? Int ?: return@after
            if (itemAt(this, position) is ChannelMembersListAdapter.Item.RoleHeader) param.result = null
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        synchronized(collapsed) {
            for (view in collapsed) {
                view.layoutParams = view.layoutParams?.apply { height = ViewGroup.LayoutParams.WRAP_CONTENT }
                view.visibility = View.VISIBLE
            }
            collapsed.clear()
        }
    }

    private fun itemAt(adapter: ChannelMembersListAdapter, position: Int): ChannelMembersListAdapter.Item? = try {
        val list = memberList.get(adapter) as? WidgetChannelMembersListViewModel.MemberList
        if (list != null && position >= 0 && position < list.size) list.get(position) else null
    } catch (e: Throwable) {
        null
    }

    private companion object {
        val memberList: Field by lazy {
            ChannelMembersListAdapter::class.java.getDeclaredField("memberList").apply { isAccessible = true }
        }
    }
}
