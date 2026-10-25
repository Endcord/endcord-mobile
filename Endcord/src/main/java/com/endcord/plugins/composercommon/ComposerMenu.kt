/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.composercommon

import android.content.Context
import android.view.View
import android.widget.EditText
import android.widget.PopupMenu
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentManager
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.PatcherAPI
import com.aliucord.i18n.I18n
import com.discord.stores.StoreStream
import com.discord.widgets.chat.input.WidgetChatInput
import com.lytefast.flexinput.fragment.FlexInputFragment
import de.robv.android.xposed.XC_MethodHook
import java.util.concurrent.CopyOnWriteArrayList

/** The chat input a composer action runs on. */
internal class ChatInput(@JvmField val fragment: FlexInputFragment) {
    val context: Context get() = fragment.requireContext()

    /** The text field of the chat input. */
    val editText: EditText? get() = try {
        fragment.l()
    } catch (e: Throwable) {
        null
    }

    /** The channel the chat input belongs to. */
    val channelId: Long get() = StoreStream.getChannelsSelected().id

    /** The raw text in the input. */
    val text: String get() = editText?.text?.toString() ?: ""

    /**
     * The text as Discord would send it: mentions and custom emojis become `<@id>` / `<:name:id>`.
     * Falls back to the raw text.
     */
    val sendableText: String
        get() = try {
            (fragment.parentFragment as? WidgetChatInput)
                ?.let { WidgetChatInput.`access$getAutocomplete$p`(it) }
                ?.inputContent?.textContent ?: text
        } catch (e: Throwable) {
            text
        }

    /** Inserts [value] at the cursor, replacing the selection. */
    fun insert(value: String) {
        val input = editText ?: return
        val editable = input.text ?: return
        val start = input.selectionStart.coerceAtLeast(0)
        val end = input.selectionEnd.coerceAtLeast(0)
        editable.replace(minOf(start, end), maxOf(start, end), value)
        input.requestFocus()
    }

    /** Replaces the whole input with [value]. */
    fun setText(value: String) {
        val input = editText ?: return
        input.setText(value)
        input.setSelection(value.length)
    }
}

/**
 * Actions shown when the send button is long-pressed: toggles like "Talk in reverse" and tools like
 * "Insert timestamp" that Endcord PC puts in the chat bar. Entries are removed when their plugin stops.
 */
internal object ComposerMenu {
    private class Action(
        val owner: String,
        val label: String,
        val checked: (() -> Boolean)?,
        val visible: () -> Boolean,
        val onClick: (ChatInput) -> Unit,
    )

    private val logger = Logger("ComposerMenu")
    private val actions = CopyOnWriteArrayList<Action>()
    private var patched = false

    /**
     * Adds an entry to the send button's long-press menu.
     *
     * @param label English label, translated when shown.
     * @param checked For toggles, whether the toggle is on. Null for plain actions.
     * @param visible Whether to show the entry right now.
     */
    @JvmStatic
    fun register(
        owner: String,
        label: String,
        checked: (() -> Boolean)? = null,
        visible: () -> Boolean = { true },
        onClick: (ChatInput) -> Unit,
    ) {
        actions += Action(owner, label, checked, visible, onClick)
        ensurePatched()
    }

    @JvmStatic
    fun unregisterAll(owner: String) {
        actions.removeAll { it.owner == owner }
    }

    @Synchronized
    private fun ensurePatched() {
        if (patched) return
        patched = true

        // FlexInputFragment gives every chat bar button the same long-press listener, which shows a tooltip.
        // Take over the send button's long press while there are actions to show.
        val listenerClass = Class.forName("b.b.a.a.i")
        val fragmentField = listenerClass.getDeclaredField("j").apply { isAccessible = true }
        val sendButtonId = Utils.getResId("send_btn_container", "id")
        PatcherAPI(logger).patch(
            listenerClass.getDeclaredMethod("onLongClick", View::class.java),
            object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    try {
                        val view = param.args[0] as? View ?: return
                        if (view.id != sendButtonId) return
                        val fragment = fragmentField[param.thisObject] as? FlexInputFragment ?: return
                        if (showMenu(view, ChatInput(fragment))) param.result = true
                    } catch (e: Throwable) {
                        logger.error("Failed to open the composer menu", e)
                    }
                }
            },
        )
    }

    private fun showMenu(anchor: View, input: ChatInput): Boolean {
        val shown = actions.filter {
            try {
                it.visible()
            } catch (e: Throwable) {
                logger.error("${it.owner}: visibility check failed", e)
                false
            }
        }
        if (shown.isEmpty()) return false

        val popup = PopupMenu(anchor.context, anchor)
        shown.forEachIndexed { index, action ->
            val item = popup.menu.add(0, index, index, I18n.t(action.label))
            action.checked?.let {
                item.isCheckable = true
                item.isChecked = try {
                    it()
                } catch (e: Throwable) {
                    false
                }
            }
        }
        popup.setOnMenuItemClickListener { item ->
            val action = shown.getOrNull(item.itemId) ?: return@setOnMenuItemClickListener false
            try {
                action.onClick(input)
            } catch (e: Throwable) {
                logger.errorToast("${action.owner}: action failed", e)
            }
            true
        }
        popup.show()
        return true
    }
}

/** Finds the chat inputs that are currently on screen. */
internal object ChatInputs {
    /** Every live [FlexInputFragment] of the app's activity. */
    @JvmStatic
    fun current(): List<FlexInputFragment> {
        val result = ArrayList<FlexInputFragment>(1)
        try {
            collect(Utils.appActivity.supportFragmentManager, result)
        } catch (e: Throwable) {
            // appActivity is not initialised yet
        }
        return result
    }

    private fun collect(manager: FragmentManager, into: MutableList<FlexInputFragment>) {
        for (fragment: Fragment in manager.fragments) {
            if (fragment is FlexInputFragment && fragment.view != null) into += fragment
            if (fragment.isAdded) collect(fragment.childFragmentManager, into)
        }
    }
}
