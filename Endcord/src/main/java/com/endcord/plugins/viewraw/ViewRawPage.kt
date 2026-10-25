/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.viewraw

import android.content.Context
import android.util.TypedValue
import android.view.View
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat
import com.aliucord.Constants
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.I18n
import com.aliucord.utils.DimenUtils
import com.aliucord.views.Button
import com.endcord.plugins.actionscommon.Common
import com.lytefast.flexinput.R

/** Shows raw text and JSON data with buttons to copy them. */
internal class ViewRawPage : SettingsPage() {
    var pageTitle: String = "View Raw"
    var dataHeader: String = "Data"
    var json: String? = null
    var content: String? = null

    override fun onViewBound(view: View) {
        super.onViewBound(view)
        setActionBarTitle(pageTitle)
        setActionBarSubtitle("Endcord")
        val ctx = view.context

        val json = json
        if (json == null) {
            addView(TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).apply { text = I18n.t("Nothing to show") })
            return
        }

        val content = content
        if (!content.isNullOrEmpty()) {
            addHeader(ctx, I18n.t("Message Content"))
            addView(code(ctx, content))
            addView(Button(ctx).apply {
                text = I18n.t("Copy Raw Content")
                setOnClickListener { Common.copy(content) }
            })
            addDivider(ctx)
        }

        addHeader(ctx, dataHeader)
        addView(code(ctx, json))
        addView(Button(ctx).apply {
            text = I18n.t("Copy Data")
            setOnClickListener { Common.copy(json) }
        })
    }

    private fun code(ctx: Context, text: String) = TextView(ctx, null, 0, R.i.UiKit_TextView).apply {
        this.text = text
        setTextIsSelectable(true)
        typeface = ResourcesCompat.getFont(ctx, Constants.Fonts.sourcecodepro_semibold)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        val p = DimenUtils.dpToPx(8)
        setPadding(p, p, p, p)
    }
}
