/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.actionscommon

import android.annotation.SuppressLint
import android.graphics.Typeface
import android.text.Editable
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextUtils
import android.text.TextWatcher
import android.text.style.StyleSpan
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import com.aliucord.Logger
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.I18n
import com.aliucord.utils.DimenUtils
import com.aliucord.views.TextInput
import com.lytefast.flexinput.R
import java.util.Locale

/**
 * A searchable list of saved items (bookmarks, tagged messages, reminders, notes) with an optional filter.
 * Tapping an item offers its actions. Subclasses describe the rows; the page handles searching and
 * re-rendering. Open it with `Utils.openPageWithProxy(context, page)`.
 */
@SuppressLint("SetTextI18n")
internal abstract class BrowserPage : SettingsPage() {
    /** One row of the list. All text is shown as given, translate it before. */
    class Row(
        val title: CharSequence,
        val body: CharSequence,
        /** Lowercase text the search box matches against. */
        val haystack: String,
        /** Values of [filterOptions] this row belongs to. */
        val groups: Collection<String> = emptyList(),
        /** Translated action labels and what they do. */
        val actions: List<Pair<String, () -> Unit>>,
    )

    /** A filter value and its translated label. */
    class FilterOption(val value: String, val label: String)

    protected val logger = Logger("BrowserPage")

    /** Translated title of the page. */
    abstract val pageTitle: String

    /** Translated text shown when nothing is stored at all. */
    abstract val emptyText: String

    /** Translated hint of the search box. */
    open val searchHint: String get() = I18n.t("Search by author or text…")

    /** Translated label of the filter picker, shown when there are [filterOptions]. */
    open val filterLabel: String get() = I18n.t("Filter")

    /** The current rows, newest first. Called on every render. */
    abstract fun rows(): List<Row>

    /** Values the list can be narrowed down to (servers, tags...). An empty list hides the filter. */
    open fun filterOptions(): List<FilterOption> = emptyList()

    private var query = ""
    private var filter: String? = null
    private var list: LinearLayout? = null
    private var count: TextView? = null
    private var filterView: TextView? = null

    override fun onViewBound(view: View) {
        super.onViewBound(view)
        setActionBarTitle(pageTitle)
        setActionBarSubtitle("Endcord")
        val ctx = view.context

        val input = TextInput(ctx, searchHint, query)
        input.editText.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                query = s?.toString().orEmpty()
                render()
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        addView(input)

        filterView = TextView(ctx, null, 0, R.i.UiKit_Settings_Item_SubText).apply {
            setOnClickListener { pickFilter() }
            visibility = View.GONE
        }
        addView(filterView)

        count = TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Header).apply { isAllCaps = false }
        addView(count)

        list = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        addView(list)

        render()
    }

    /** Rebuilds the list, for example after an item was removed. */
    fun render() {
        val list = list ?: return
        val ctx = list.context ?: return
        list.removeAllViews()

        val options = try {
            filterOptions()
        } catch (e: Throwable) {
            logger.error("Failed to build filters", e)
            emptyList()
        }
        if (filter != null && options.none { it.value == filter }) filter = null
        filterView?.run {
            visibility = if (options.size > 1) View.VISIBLE else View.GONE
            val current = options.firstOrNull { it.value == filter }?.label ?: I18n.t("All")
            text = "$filterLabel\n$current"
        }

        val all = try {
            rows()
        } catch (e: Throwable) {
            logger.error("Failed to build rows", e)
            emptyList()
        }
        val needle = query.trim().lowercase(Locale.ROOT)
        val shown = all.filter { row ->
            (needle.isEmpty() || row.haystack.contains(needle)) && (filter == null || filter in row.groups)
        }

        count?.text = "${shown.size} / ${all.size}"

        if (shown.isEmpty()) {
            TextView(ctx, null, 0, R.i.UiKit_Settings_Item_Addition).run {
                text = if (all.isEmpty()) emptyText else I18n.t("Nothing matches your search.")
                setPadding(0, DimenUtils.defaultPadding, 0, DimenUtils.defaultPadding)
                list.addView(this)
            }
            return
        }

        for (row in shown) {
            TextView(ctx, null, 0, R.i.UiKit_Settings_Item_SubText).run {
                val title = SpannableStringBuilder(row.title)
                title.setSpan(StyleSpan(Typeface.BOLD), 0, title.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                text = title.append('\n').append(row.body)
                maxLines = 5
                ellipsize = TextUtils.TruncateAt.END
                setOnClickListener {
                    Common.pick(parentFragmentManager, row.title.toString(), row.actions.map { it.first }) { index ->
                        row.actions[index].second()
                    }
                }
                list.addView(this)
            }
        }
    }

    private fun pickFilter() {
        val options = filterOptions()
        val labels = listOf(I18n.t("All")) + options.map { it.label }
        Common.pick(parentFragmentManager, filterLabel, labels) { index ->
            filter = if (index == 0) null else options[index - 1].value
            render()
        }
    }

    /** Makes a lowercase search haystack out of [parts]. */
    protected fun haystack(vararg parts: String?): String =
        parts.filterNotNull().joinToString("\n").lowercase(Locale.ROOT)
}
