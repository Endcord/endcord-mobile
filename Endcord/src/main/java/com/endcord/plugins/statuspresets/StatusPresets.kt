/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.statuspresets

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.DimenUtils
import com.aliucord.utils.RxUtils
import com.aliucord.views.Button
import com.discord.databinding.WidgetUserSetCustomStatusBinding
import com.discord.models.domain.ModelCustomStatusSetting
import com.discord.models.domain.emoji.ModelEmojiCustom
import com.discord.models.domain.emoji.ModelEmojiUnicode
import com.discord.stores.StoreStream
import com.discord.utilities.rx.ObservableExtensionsKt
import com.discord.utilities.time.TimeUtils
import com.discord.widgets.user.WidgetUserSetCustomStatus
import com.discord.widgets.user.WidgetUserSetCustomStatusViewModel
import com.discord.widgets.user.WidgetUserSetCustomStatusViewModel.FormState.Expiration
import org.json.JSONArray
import org.json.JSONObject
import java.lang.reflect.Method
import java.util.Calendar

internal class StatusPresets : EndcordPlugin(
    name = "StatusPresets",
    description = "Allows you to remember your statuses and set them later",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("activity", "utility")

    private class Preset(
        val text: String,
        val emojiId: Long?,
        /** The unicode emoji, or the custom emoji's name for display. */
        val emojiName: String?,
        val expiration: String,
    ) {
        val label get() = if (emojiName.isNullOrEmpty()) text else if (emojiId != null) ":$emojiName: $text" else "$emojiName $text"
    }

    private val getBinding: Method by lazy {
        WidgetUserSetCustomStatus::class.java.getDeclaredMethod("getBinding").apply { isAccessible = true }
    }
    private val getViewModel: Method by lazy {
        WidgetUserSetCustomStatus::class.java.getDeclaredMethod("getViewModel").apply { isAccessible = true }
    }

    override fun start(context: Context) {
        patcher.after<WidgetUserSetCustomStatus>("onViewBound", View::class.java) {
            try {
                addButtons(this)
            } catch (e: Throwable) {
                logger.error("Failed to add the status preset buttons", e)
            }
        }
    }

    private fun addButtons(fragment: WidgetUserSetCustomStatus) {
        val binding = getBinding.invoke(fragment) as WidgetUserSetCustomStatusBinding
        val radioGroup = binding.d.parent as? ViewGroup ?: return
        val container = radioGroup.parent as? ViewGroup ?: return
        val ctx = container.context
        val margin = DimenUtils.defaultPadding

        val row = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(margin, margin / 2, margin, margin / 2)
        }
        fun button(text: String, onClick: () -> Unit) = Button(ctx).apply {
            this.text = text
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = margin / 4
                marginEnd = margin / 4
            }
        }
        row.addView(button(I18n.t("Keep")) { saveCurrent(fragment) })
        row.addView(button(I18n.t("Status Presets")) { showPresets(fragment) })
        container.addView(row, container.indexOfChild(radioGroup) + 1)
    }

    private fun saveCurrent(fragment: WidgetUserSetCustomStatus) {
        val vm = getViewModel.invoke(fragment) as WidgetUserSetCustomStatusViewModel
        val form = (vm.viewState as? WidgetUserSetCustomStatusViewModel.ViewState.Loaded)?.formState ?: return
        val text = form.text.trim()
        if (text.isEmpty()) {
            Utils.showToast(I18n.t("Write a status first"))
            return
        }
        val emoji = form.emoji
        val preset = when (emoji) {
            is ModelEmojiCustom -> Preset(text, emoji.id, emoji.name, form.expiration.name)
            is ModelEmojiUnicode -> Preset(text, null, emoji.surrogates, form.expiration.name)
            else -> Preset(text, null, null, form.expiration.name)
        }
        val presets = load().filter { it.text != text } + preset
        save(presets)
        Utils.showToast(I18n.t("Successfully Saved Status"))
    }

    private fun showPresets(fragment: WidgetUserSetCustomStatus) {
        val ctx = fragment.context ?: return
        val presets = load()
        if (presets.isEmpty()) {
            Utils.showToast(I18n.t("No status presets yet. Write a status and tap Keep to save it."))
            return
        }
        AlertDialog.Builder(ctx)
            .setTitle(I18n.t("Status Presets"))
            .setItems(presets.map { it.label }.toTypedArray()) { _, which -> apply(fragment, presets[which]) }
            .setNeutralButton(I18n.t("Delete Preset")) { _, _ -> showDelete(ctx) }
            .setNegativeButton(I18n.t("Cancel"), null)
            .show()
    }

    private fun showDelete(ctx: Context) {
        val presets = load()
        if (presets.isEmpty()) return
        AlertDialog.Builder(ctx)
            .setTitle(I18n.t("Delete Preset"))
            .setItems(presets.map { it.label }.toTypedArray()) { _, which ->
                save(presets.filterIndexed { i, _ -> i != which })
                Utils.showToast(I18n.t("Deleted the preset"))
            }
            .setNegativeButton(I18n.t("Cancel"), null)
            .show()
    }

    private fun apply(fragment: WidgetUserSetCustomStatus, preset: Preset) {
        val expiration = try {
            Expiration.valueOf(preset.expiration)
        } catch (e: IllegalArgumentException) {
            Expiration.NEVER
        }
        val setting = ModelCustomStatusSetting(
            preset.text,
            preset.emojiId,
            if (preset.emojiId != null) null else preset.emojiName,
            expiresAt(expiration),
        )
        val request = StoreStream.getUserSettings().updateCustomStatus(setting)
        val subscriber = RxUtils.createActionSubscriber<Any?>(
            { fragment.activity?.onBackPressed() },
            { e ->
                logger.error("Failed to set the status preset", e)
                Utils.showToast(I18n.t("Failed to set the status"))
            },
        )
        RxUtils.run { ObservableExtensionsKt.ui(ObservableExtensionsKt.restSubscribeOn(request, true)).subscribe(subscriber) }
    }

    /** Same as the app's own custom status screen: a UTC date, or null for "Don't clear". */
    private fun expiresAt(expiration: Expiration): String? {
        val now = System.currentTimeMillis()
        val at = when (expiration) {
            Expiration.NEVER -> return null
            Expiration.IN_30_MINUTES -> now + 30 * 60_000L
            Expiration.IN_1_HOUR -> now + 60 * 60_000L
            Expiration.IN_4_HOURS -> now + 4 * 60 * 60_000L
            Expiration.TOMORROW -> Calendar.getInstance().apply {
                add(Calendar.DAY_OF_YEAR, 1)
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }.timeInMillis
        }
        return TimeUtils.`toUTCDateTime$default`(at, null, 2, null)
    }

    private fun load(): List<Preset> = try {
        val array = JSONArray(settings.getString(PRESETS_KEY, "[]") ?: "[]")
        val out = ArrayList<Preset>()
        for (i in 0 until array.length()) {
            val o = array.optJSONObject(i) ?: continue
            val text = o.optString("text")
            if (text.isEmpty()) continue
            out.add(
                Preset(
                    text,
                    if (o.has("emojiId")) o.optString("emojiId").toLongOrNull() else null,
                    o.optString("emojiName").ifEmpty { null },
                    o.optString("expiration", Expiration.NEVER.name),
                ),
            )
        }
        out
    } catch (e: Throwable) {
        logger.error("Failed to read the status presets", e)
        emptyList()
    }

    private fun save(presets: List<Preset>) {
        val array = JSONArray()
        for (p in presets) {
            array.put(
                JSONObject().put("text", p.text).put("emojiName", p.emojiName ?: "").put("expiration", p.expiration).apply {
                    if (p.emojiId != null) put("emojiId", p.emojiId.toString())
                },
            )
        }
        settings.setString(PRESETS_KEY, array.toString())
    }

    private companion object {
        const val PRESETS_KEY = "presets"
    }
}
