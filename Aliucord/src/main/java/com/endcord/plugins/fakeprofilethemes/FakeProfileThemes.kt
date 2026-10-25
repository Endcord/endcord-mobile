/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.fakeprofilethemes

import android.content.Context
import android.text.InputType
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.fragments.InputDialog
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.discord.stores.StoreStream
import com.discord.widgets.user.profile.UserProfileHeaderViewModel
import com.endcord.plugins.commandscommon.Dialogs
import java.util.Locale
import java.util.regex.Pattern

/**
 * Reads profile colours hidden in a bio with invisible "3y3" text (Unicode tag characters), as written by
 * Endcord PC, Vencord and compatible plugins.
 *
 * The Android app predates profile themes: a profile only has a banner, coloured with the banner colour when
 * there is no banner image. So only the primary colour is shown, as the banner colour of the profile sheet. It
 * is purely local: nothing is sent to Discord. The settings page builds the invisible text for your own bio.
 */
internal class FakeProfileThemes : EndcordPlugin(
    name = "FakeProfileThemes",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "source",
            label = "Default color source if both are present",
            options = listOf(
                PluginSetting.Choice.Option("nitro", "Nitro colors"),
                PluginSetting.Choice.Option("fake", "Fake colors"),
            ),
        ),
        PluginSetting.Action(
            key = "copy",
            label = "Copy 3y3",
            description = "Build the invisible text for your own colors, then paste it anywhere in your bio",
        ) { askColors(it) },
    )

    override fun start(context: Context) {
        patcher.after<UserProfileHeaderViewModel.ViewState.Loaded>("getBannerColorHex") { param ->
            try {
                if (param.result != null && choice("source") == "nitro") return@after
                val colors = decode(user?.bio) ?: return@after
                param.result = hex(colors[0])
            } catch (e: Throwable) {
                logger.error("Failed to read profile colors", e)
            }
        }
    }

    private fun askColors(context: Context) {
        val current = try {
            decode(StoreStream.getUsers().me.bio)
        } catch (_: Throwable) {
            null
        }
        val dialog = InputDialog()
            .setTitle(I18n.t("Copy 3y3"))
            .setDescription(
                I18n.t("Enter your primary and accent colors as hex codes, for example #5865f2, #eb459e.") + "\n" +
                    I18n.t("Then paste the invisible text anywhere in your bio. Other people need a compatible plugin to see the colors."),
            )
            .setPlaceholderText("#5865f2, #eb459e")
            .setInputType(InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)
        dialog.setOnDialogShownListener {
            if (current != null) dialog.inputLayout.editText?.setText("${hex(current[0])}, ${hex(current[1])}")
        }
        dialog.setOnOkListener {
            val colors = parseColors(dialog.input)
            if (colors == null) {
                Utils.showToast(I18n.t("Enter two colors, for example #5865f2, #eb459e"))
                return@setOnOkListener
            }
            Dialogs.copy(encode(colors[0], colors[1]))
            dialog.dismiss()
        }
        dialog.show(Utils.appActivity.supportFragmentManager, "FakeProfileThemes")
    }

    private companion object {
        const val DESCRIPTION =
            "Shows profile colors hidden in bios with invisible 3y3 encoding as the profile banner color"

        private val HEX_PAIR: Pattern = Pattern.compile("\\[#([0-9a-fA-F]{1,6}),#([0-9a-fA-F]{1,6})]")
        private val INPUT_COLOR: Pattern = Pattern.compile("#?([0-9a-fA-F]{6})")

        fun hex(color: Int) = String.format(Locale.ROOT, "#%06x", color and 0xFFFFFF)

        /** The [primary, accent] colors hidden in [bio], or null. Only the invisible tag characters are read. */
        fun decode(bio: String?): IntArray? {
            if (bio.isNullOrEmpty()) return null
            val hidden = StringBuilder()
            var i = 0
            while (i < bio.length) {
                val cp = bio.codePointAt(i)
                if (cp in 0xE0020..0xE007F) hidden.append((cp - 0xE0000).toChar())
                i += Character.charCount(cp)
            }
            if (hidden.isEmpty()) return null
            val m = HEX_PAIR.matcher(hidden)
            if (!m.find()) return null
            return intArrayOf(m.group(1)!!.toInt(16), m.group(2)!!.toInt(16))
        }

        /** The text to paste in a bio: a space, then `[#primary,#accent]` written in invisible tag characters. */
        fun encode(primary: Int, accent: Int): String {
            val message = "[${hex(primary)},${hex(accent)}]"
            val sb = StringBuilder(" ")
            for (c in message) {
                if (c.code in 0x20..0x7F) sb.appendCodePoint(c.code + 0xE0000)
            }
            return sb.toString()
        }

        fun parseColors(input: String): IntArray? {
            val m = INPUT_COLOR.matcher(input)
            val found = ArrayList<Int>(2)
            while (found.size < 2 && m.find()) found.add(m.group(1)!!.toInt(16))
            return if (found.size == 2) intArrayOf(found[0], found[1]) else null
        }
    }
}
