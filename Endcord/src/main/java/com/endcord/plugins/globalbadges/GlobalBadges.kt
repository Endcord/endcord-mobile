/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.globalbadges

import android.content.Context
import android.widget.ImageView
import com.aliucord.PluginManager
import com.aliucord.Utils
import com.aliucord.coreplugins.badges.setCacheableImage
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.discord.api.user.UserProfile
import com.discord.databinding.UserProfileHeaderBadgeBinding
import com.discord.widgets.user.Badge
import com.discord.widgets.user.profile.UserProfileHeaderView
import com.endcord.plugins.commandscommon.Net
import java.lang.reflect.Field
import java.util.Collections
import java.util.WeakHashMap
import com.discord.models.user.User as ModelUser

internal class GlobalBadges : EndcordPlugin(
    name = "GlobalBadges",
    description = "Adds global badges from other client mods",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "profiles")

    override val settingsSchema = listOf(
        PluginSetting.Switch("showPrefix", "Shows the Mod as Prefix", default = true),
        PluginSetting.Switch("showSuffix", "Shows the Mod as Suffix", default = false),
        PluginSetting.Switch("showCustom", "Show Custom Badges", default = true),
        PluginSetting.Switch("showNekocord", "Show Nekocord Badges", default = true),
        PluginSetting.Switch("showReviewDB", "Show ReviewDB Badges", default = true),
        PluginSetting.Switch("showAero", "Show Aero Badges", default = true),
        PluginSetting.Switch(
            "showAliucord",
            "Show Aliucord Badges",
            "Skipped while the built-in Badges plugin is on, since it already shows them",
            default = true,
        ),
        PluginSetting.Switch("showRaincord", "Show Raincord Badges", default = true),
        PluginSetting.Switch("showVelocity", "Show Velocity Badges", default = true),
        PluginSetting.Switch("showEnmity", "Show Enmity Badges", default = true),
        PluginSetting.Switch("showPaicord", "Show Paicord Badges", default = true),
        PluginSetting.Text("apiUrl", "API to use", default = DEFAULT_API, placeholder = DEFAULT_API),
        PluginSetting.Action("refetch", "Refetch Global Badges") {
            Utils.threadPool.execute {
                val ok = load()
                Utils.mainThread.post {
                    Utils.showToast(if (ok) I18n.t("Successfully refetched global badges!") else I18n.t("Couldn't load global badges"))
                }
            }
        },
    )

    private class RawBadge(val tooltip: String, val url: String, val mod: String)

    @Volatile
    private var badges: Map<Long, List<RawBadge>> = emptyMap()

    @Volatile
    private var loadedAt = 0L

    /** Badges this plugin created, so only their images are set here. */
    private val ours: MutableSet<Badge> = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap()))

    private val fBinding: Field by lazy {
        UserProfileHeaderView.BadgeViewHolder::class.java.getDeclaredField("binding").apply { isAccessible = true }
    }

    override fun start(context: Context) {
        Utils.threadPool.execute { load() }

        patcher.after<Badge.Companion>(
            "getBadgesForUser",
            ModelUser::class.java,
            UserProfile::class.java,
            Boolean::class.javaPrimitiveType!!,
            Boolean::class.javaPrimitiveType!!,
            Context::class.java,
        ) { param ->
            try {
                val user = param.args[0] as ModelUser? ?: return@after
                if (System.currentTimeMillis() - loadedAt > REFRESH_INTERVAL) {
                    loadedAt = System.currentTimeMillis()
                    Utils.threadPool.execute { load() }
                }
                val extra = badgesFor(user.id)
                if (extra.isEmpty()) return@after
                @Suppress("UNCHECKED_CAST")
                val current = param.result as List<Badge>? ?: emptyList()
                param.result = ArrayList<Badge>(current.size + extra.size).apply {
                    addAll(extra)
                    addAll(current)
                }
            } catch (e: Throwable) {
                this@GlobalBadges.logger.error("Failed to add global badges", e)
            }
        }

        patcher.after<UserProfileHeaderView.BadgeViewHolder>("bind", Badge::class.java) { param ->
            try {
                val badge = param.args[0] as Badge? ?: return@after
                if (badge !in ours) return@after
                val url = badge.objectType ?: return@after
                // The built-in Badges plugin already loads images of url badges
                if (PluginManager.isPluginEnabled("Badges")) return@after
                val image: ImageView = (fBinding[this] as UserProfileHeaderBadgeBinding).b
                image.setCacheableImage(url)
            } catch (e: Throwable) {
                this@GlobalBadges.logger.error("Failed to show a global badge", e)
            }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        badges = emptyMap()
        ours.clear()
    }

    private fun badgesFor(userId: Long): List<Badge> {
        val raw = badges[userId] ?: return emptyList()
        val builtInBadges = PluginManager.isPluginEnabled("Badges")
        val result = ArrayList<Badge>(raw.size)
        for (b in raw) {
            val shown = when (b.mod) {
                "badgevault" -> bool("showCustom")
                "nekocord" -> bool("showNekocord")
                "reviewdb" -> bool("showReviewDB")
                "aero" -> bool("showAero")
                "aliucord" -> bool("showAliucord") && !builtInBadges
                "raincord" -> bool("showRaincord")
                "velocity" -> bool("showVelocity")
                "enmity" -> bool("showEnmity")
                "paicord" -> bool("showPaicord")
                else -> true
            }
            if (!shown) continue
            val modName = SERVICE_NAMES[b.mod] ?: b.mod
            val tooltip = when {
                bool("showPrefix") -> "$modName - ${b.tooltip}"
                bool("showSuffix") -> "${b.tooltip} - $modName"
                else -> b.tooltip
            }
            // Icon 0 with the image url in objectType is how the built-in Badges plugin marks url badges
            val badge = Badge(0, null, tooltip, false, b.url)
            ours += badge
            result += badge
        }
        return result
    }

    private fun load(): Boolean {
        return try {
            val base = string("apiUrl").trim().ifEmpty { DEFAULT_API }
            val url = if (base.endsWith("/")) base + "users" else "$base/users"
            val users = Net.getObject(url).getJSONObject("users")
            val map = HashMap<Long, List<RawBadge>>(users.length() * 2)
            val keys = users.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val id = key.toLongOrNull() ?: continue
                val array = users.optJSONArray(key) ?: continue
                val list = ArrayList<RawBadge>(array.length())
                for (i in 0 until array.length()) {
                    val o = array.optJSONObject(i) ?: continue
                    val mod = o.optString("mod")
                    if (mod.isEmpty() || mod in BLOCKED_MODS) continue
                    val image = o.optString("badge")
                    if (!image.startsWith("http")) continue
                    list += RawBadge(o.optString("tooltip"), image, mod)
                }
                if (list.isNotEmpty()) map[id] = list
            }
            badges = map
            loadedAt = System.currentTimeMillis()
            true
        } catch (e: Throwable) {
            logger.warn("Failed to load global badges: ${e.message}")
            false
        }
    }

    private companion object {
        const val DEFAULT_API = "https://badges.equicord.org/"
        const val REFRESH_INTERVAL = 30 * 60 * 1000L

        /** Endcord's own badges are shown by Endcord itself. */
        val BLOCKED_MODS = setOf("vencord", "endcord")

        val SERVICE_NAMES = mapOf(
            "badgevault" to "BadgeVault",
            "nekocord" to "Nekocord",
            "reviewdb" to "ReviewDB",
            "aero" to "Aero",
            "aliucord" to "Aliucord",
            "raincord" to "Raincord",
            "velocity" to "Velocity",
            "enmity" to "Enmity",
            "paicord" to "Paicord",
        )
    }
}
