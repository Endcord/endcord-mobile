/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.reviewdb

import android.content.Context
import androidx.fragment.app.FragmentActivity
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.models.domain.ModelUserRelationship
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.userscommon.Users
import com.lytefast.flexinput.R
import java.text.DateFormat
import java.util.Date

internal class ReviewDB : EndcordPlugin(
    name = "ReviewDB",
    description = "Read the reviews other users left on a profile (Adds a new entry to profiles)",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("profiles", "social")

    override val settingsSchema = listOf(
        PluginSetting.Switch(
            "showWarning",
            "Display warning to be respectful at the top of the reviews list",
            default = true,
        ),
        PluginSetting.Switch("hideTimestamps", "Hide timestamps on reviews", default = false),
        PluginSetting.Switch("hideBlockedUsers", "Hide reviews from blocked users", default = true),
        PluginSetting.Action("website", "ReviewDB website") { Utils.launchUrl("https://reviewdb.mantikafasi.dev") },
    )

    private class Review(val author: String, val authorId: Long, val comment: String, val timestamp: Long, val system: Boolean)

    override fun start(context: Context) {
        UserSheetActions.register(name, "View Reviews", R.e.ic_star_24dp, visible = { !it.user.isBot }) { ctx ->
            val activity = ctx.sheet.activity ?: return@register
            load(activity, ctx.user.id, Users.displayName(ctx.user))
        }
    }

    private fun load(activity: FragmentActivity, userId: Long, userName: String) {
        Utils.threadPool.execute {
            val result = try {
                fetch(userId)
            } catch (e: Throwable) {
                logger.warn("Failed to fetch reviews: ${e.message}")
                null
            }
            Utils.mainThread.post {
                if (activity.isFinishing) return@post
                val title = "${I18n.t("User Reviews")}: $userName"
                if (result == null) {
                    Dialogs.showText(activity, title, I18n.t("Network error: Failed to connect to ReviewDB."))
                } else {
                    Dialogs.showText(activity, title, format(result))
                }
            }
        }
    }

    private fun fetch(userId: Long): List<Review>? {
        val flags = if (bool("showWarning")) 0 else WARNING_FLAG
        val url = "$API_URL/users/$userId/reviews" + (if (flags != 0) "?flags=$flags" else "")
        val json = Net.getObject(url)
        if (json.optBoolean("hasOptedOut")) return emptyList()
        val array = json.optJSONArray("reviews") ?: return emptyList()
        val blocked = if (bool("hideBlockedUsers")) blockedIds() else emptySet()
        val reviews = ArrayList<Review>(array.length())
        for (i in 0 until array.length()) {
            val o = array.optJSONObject(i) ?: continue
            val sender = o.optJSONObject("sender")
            val authorId = sender?.optString("discordID")?.toLongOrNull() ?: 0L
            if (authorId in blocked) continue
            reviews += Review(
                author = sender?.optString("username").orEmpty().ifEmpty { "?" },
                authorId = authorId,
                comment = o.optString("comment"),
                timestamp = o.optLong("timestamp") * 1000,
                system = o.optInt("type") == TYPE_SYSTEM,
            )
        }
        return reviews
    }

    private fun blockedIds(): Set<Long> =
        com.discord.stores.StoreStream.getUserRelationships().relationships
            .filterValues { it == ModelUserRelationship.TYPE_BLOCKED }.keys

    private fun format(reviews: List<Review>): String {
        if (reviews.none { !it.system }) {
            val sb = StringBuilder()
            reviews.filter { it.system }.forEach { sb.append(it.comment).append("\n\n") }
            sb.append(I18n.t("Nobody has reviewed this user yet."))
            return sb.toString()
        }
        val dateFormat = DateFormat.getDateInstance(DateFormat.MEDIUM)
        val sb = StringBuilder()
        for (review in reviews) {
            if (review.system) {
                sb.append(review.comment).append("\n\n")
                continue
            }
            sb.append(review.author)
            if (!bool("hideTimestamps") && review.timestamp > 0) sb.append(" · ").append(dateFormat.format(Date(review.timestamp)))
            sb.append('\n').append(review.comment).append("\n\n")
        }
        return sb.toString().trimEnd()
    }

    private companion object {
        const val API_URL = "https://manti.vendicated.dev/api/reviewdb"
        const val WARNING_FLAG = 0b10
        const val TYPE_SYSTEM = 3
    }
}
