/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.reverseimagesearch

import android.content.Context
import android.net.Uri
import androidx.fragment.app.FragmentManager
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.i18n.I18n
import com.endcord.plugins.actionscommon.Common
import com.endcord.plugins.actionscommon.MessageParts
import com.endcord.plugins.api.MessageActions
import com.lytefast.flexinput.R

internal class ReverseImageSearch : EndcordPlugin(
    name = "ReverseImageSearch",
    description = "Adds ImageSearch to image context menus",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "utility")

    override fun start(context: Context) {
        MessageActions.register(
            name,
            "Search Image",
            R.e.ic_search_white_24dp,
            visible = { images(it).isNotEmpty() },
        ) { ctx ->
            val images = images(ctx)
            val fm = ctx.sheet.parentFragmentManager
            if (images.size == 1) {
                pickEngine(fm, images[0].url)
            } else {
                Common.pick(fm, I18n.t("Search Image"), images.map { it.label }) { pickEngine(fm, images[it].url) }
            }
        }
    }

    /** Images only: search engines can't look up videos. */
    private fun images(ctx: MessageActions.Context) = MessageParts.media(ctx.message).filter { !it.isVideo }

    private fun pickEngine(fm: FragmentManager, src: String) {
        val names = engines.map { it.first } + I18n.t("All")
        Common.pick(fm, I18n.t("Search Image"), names) { index ->
            if (index < engines.size) search(src, engines[index].second)
            else engines.forEach { search(src, it.second) }
        }
    }

    private fun search(src: String, engine: String) = Utils.launchUrl(engine + Uri.encode(src))

    private companion object {
        // Same engines as Endcord PC
        val engines = listOf(
            "Google" to "https://lens.google.com/uploadbyurl?url=",
            "Yandex" to "https://yandex.com/images/search?rpt=imageview&url=",
            "SauceNAO" to "https://saucenao.com/search.php?url=",
            "IQDB" to "https://iqdb.org/?url=",
            "Bing" to "https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:",
            "TinEye" to "https://www.tineye.com/search?url=",
            "ImgOps" to "https://imgops.com/start?url=",
        )
    }
}
