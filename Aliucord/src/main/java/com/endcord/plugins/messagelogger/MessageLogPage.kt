/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.messagelogger

import android.annotation.SuppressLint
import android.content.Context
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.format.DateUtils
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import com.aliucord.Utils
import com.aliucord.fragments.SettingsPage
import com.aliucord.i18n.tr
import com.aliucord.utils.ChannelUtils
import com.aliucord.utils.DimenUtils
import com.aliucord.views.Button
import com.aliucord.views.Divider
import com.discord.stores.StoreStream
import com.discord.utilities.color.ColorCompat
import com.lytefast.flexinput.R

/** Lists what MessageLogger logged, newest first. */
internal class MessageLogPage : SettingsPage() {
    private var filter: MessageLog.Kind? = null

    override fun onViewBound(view: View) {
        super.onViewBound(view)
        setActionBarTitle(tr("Message Log"))
        setActionBarSubtitle("MessageLogger")
        render()
    }

    @SuppressLint("SetTextI18n")
    private fun render() {
        val layout = linearLayout
        val ctx = layout.context
        layout.removeAllViews()

        // Filter buttons, like the tabs of Endcord PC's log window
        val tabs = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        fun tab(label: String, kind: MessageLog.Kind?) {
            Button(ctx).apply {
                text = tr(label)
                alpha = if (filter == kind) 1f else 0.6f
                setOnClickListener {
                    filter = kind
                    render()
                }
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    marginEnd = DimenUtils.dpToPx(4)
                }
                tabs.addView(this)
            }
        }
        tab("All", null)
        tab("Deleted", MessageLog.Kind.DELETED)
        tab("Edited", MessageLog.Kind.EDITED)
        tab("Ghost Pinged", MessageLog.Kind.GHOST_PING)
        layout.addView(tabs)

        val entries = MessageLog.snapshot().filter { filter == null || it.kind == filter }
        if (entries.isEmpty()) {
            TextView(ctx, null, 0, R.i.UiKit_Settings_Item_SubText).apply {
                text = tr("Nothing logged yet")
                setPadding(0, DimenUtils.defaultPadding, 0, 0)
                layout.addView(this)
            }
            return
        }

        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_SubText).apply {
            text = tr("Long press an entry to copy it")
            setPadding(0, DimenUtils.defaultPadding / 2, 0, DimenUtils.defaultPadding / 2)
            layout.addView(this)
        }

        for ((i, entry) in entries.withIndex()) {
            if (i > 0) layout.addView(Divider(ctx))
            layout.addView(entryView(ctx, entry))
        }
    }

    private fun entryView(ctx: Context, entry: MessageLog.Entry): View {
        val muted = ColorCompat.getThemedColor(ctx, R.b.colorTextMuted)
        val accent = when (entry.kind) {
            MessageLog.Kind.EDITED -> ColorCompat.getThemedColor(ctx, R.b.colorTextWarning)
            else -> ColorCompat.getThemedColor(ctx, R.b.colorTextDanger)
        }
        val kindLabel = when (entry.kind) {
            MessageLog.Kind.DELETED -> tr("Deleted")
            MessageLog.Kind.EDITED -> tr("Edited")
            MessageLog.Kind.GHOST_PING -> tr("Ghost Pinged")
        }
        val channel = StoreStream.getChannels().getChannel(entry.channelId)
        val where = channel?.let { ChannelUtils.getDisplayNameOrDefault(it, ctx, true) } ?: entry.channelId.toString()
        val time = DateUtils.getRelativeTimeSpanString(entry.loggedAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS)

        val text = SpannableStringBuilder()
        text.append(kindLabel)
        text.setSpan(ForegroundColorSpan(accent), 0, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        text.setSpan(StyleSpan(android.graphics.Typeface.BOLD), 0, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        val metaStart = text.length
        text.append("  ").append(entry.authorName).append(" · ").append(where).append(" · ").append(time)
        text.setSpan(ForegroundColorSpan(muted), metaStart, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        text.append('\n')

        val body = entry.content.ifEmpty {
            if (entry.attachments > 0) tr("{count} attachments", "count" to entry.attachments) else ""
        }
        if (entry.kind == MessageLog.Kind.EDITED && entry.newContent != null) {
            val oldStart = text.length
            text.append(body)
            text.setSpan(ForegroundColorSpan(muted), oldStart, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            text.append("\n→ ").append(entry.newContent)
        } else {
            text.append(body)
        }

        return TextView(ctx, null, 0, R.i.UiKit_Settings_Item_SubText).apply {
            this.text = text
            setTextColor(ColorCompat.getThemedColor(ctx, R.b.colorTextNormal))
            setPadding(0, DimenUtils.defaultPadding / 2, 0, DimenUtils.defaultPadding / 2)
            setOnLongClickListener {
                Utils.setClipboard("Message", if (entry.kind == MessageLog.Kind.EDITED) "${entry.content}\n→ ${entry.newContent}" else entry.content)
                Utils.showToast(tr("Copied to Clipboard"))
                true
            }
        }
    }
}

/** Every logged version of one message, oldest first. */
internal class EditHistoryPage(private val messageId: Long, private val currentContent: String) : SettingsPage() {
    override fun onViewBound(view: View) {
        super.onViewBound(view)
        setActionBarTitle(tr("Message Edit History"))
        setActionBarSubtitle("MessageLogger")

        val layout = linearLayout
        val ctx = layout.context
        val muted = ColorCompat.getThemedColor(ctx, R.b.colorTextMuted)
        val edits = MessageLog.editsOf(messageId).orEmpty()

        TextView(ctx, null, 0, R.i.UiKit_Settings_Item_SubText).apply {
            text = tr("Long press a version to copy it")
            setPadding(0, 0, 0, DimenUtils.defaultPadding / 2)
            layout.addView(this)
        }

        fun version(label: CharSequence, content: String) {
            val text = SpannableStringBuilder(label)
            text.setSpan(ForegroundColorSpan(muted), 0, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            text.append('\n').append(content)
            TextView(ctx, null, 0, R.i.UiKit_Settings_Item_SubText).apply {
                this.text = text
                setTextColor(ColorCompat.getThemedColor(ctx, R.b.colorTextNormal))
                setPadding(0, DimenUtils.defaultPadding / 2, 0, DimenUtils.defaultPadding / 2)
                setOnLongClickListener {
                    Utils.setClipboard("Message", content)
                    Utils.showToast(tr("Copied to Clipboard"))
                    true
                }
                layout.addView(this)
            }
        }

        for ((i, edit) in edits.withIndex()) {
            if (i > 0) layout.addView(Divider(ctx))
            val time = DateUtils.formatDateTime(ctx, edit.editedAt, DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_TIME)
            version(tr("Replaced {time}", "time" to time), edit.content)
        }
        if (edits.isNotEmpty()) layout.addView(Divider(ctx))
        version(tr("Current"), currentContent)
    }
}
