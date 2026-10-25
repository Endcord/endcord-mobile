/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.githubrepos

import android.content.Context
import androidx.fragment.app.FragmentActivity
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.discord.api.connectedaccounts.ConnectedAccount
import com.discord.api.user.UserProfile
import com.endcord.plugins.api.UserSheetActions
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.commandscommon.Net
import com.lytefast.flexinput.R
import org.json.JSONArray
import java.util.concurrent.ConcurrentHashMap

internal class GitHubRepos : EndcordPlugin(
    name = "GitHubRepos",
    description = "Displays a user's public GitHub repositories in their profile",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("profiles", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Switch("showStars", "Show repository stars", default = true),
        PluginSetting.Switch("showLanguage", "Show repository language", default = true),
    )

    private class Repo(val name: String, val url: String, val stars: Int, val language: String?, val fork: Boolean)

    private class Cached(val repos: List<Repo>, val time: Long)

    private val cache = ConcurrentHashMap<String, Cached>()

    override fun start(context: Context) {
        UserSheetActions.register(
            name,
            "GitHub Repositories",
            R.e.ic_account_github_white_24dp,
            visible = { github(it.state.userProfile) != null },
        ) { ctx ->
            val activity = ctx.sheet.activity ?: return@register
            val account = github(ctx.state.userProfile) ?: return@register
            show(activity, account.b(), account.d())
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        cache.clear()
    }

    private fun github(profile: UserProfile?): ConnectedAccount? =
        profile?.b()?.firstOrNull { it.g() == "github" && !it.b().isNullOrEmpty() }

    private fun show(activity: FragmentActivity, githubId: String, username: String?) {
        Utils.showToast(I18n.t("Loading repositories..."))
        Utils.threadPool.execute {
            val repos = try {
                fetch(githubId, username)
            } catch (e: Throwable) {
                logger.warn("Failed to fetch GitHub repositories: ${e.message}")
                null
            }
            Utils.mainThread.post {
                if (activity.isFinishing || activity.isDestroyed) return@post
                val title = I18n.t("GitHub Repositories") + (username?.let { " · $it" } ?: "")
                when {
                    repos == null -> Dialogs.showText(activity, title, I18n.t("Couldn't load the repositories"))
                    repos.isEmpty() -> Dialogs.showText(activity, title, I18n.t("No public repositories"))
                    else -> Dialogs.showList(activity, title, repos.map { label(it) }) { Utils.launchUrl(repos[it].url) }
                }
            }
        }
    }

    private fun label(repo: Repo): String {
        val sb = StringBuilder(repo.name)
        if (bool("showStars")) sb.append("  ★ ").append(repo.stars)
        if (bool("showLanguage") && !repo.language.isNullOrEmpty()) sb.append("  · ").append(repo.language)
        return sb.toString()
    }

    private fun fetch(githubId: String, username: String?): List<Repo> {
        cache[githubId]?.let { if (System.currentTimeMillis() - it.time < CACHE_TTL) return it.repos }
        val array = try {
            Net.getArray("https://api.github.com/user/${Net.encodeURIComponent(githubId)}/repos?sort=stars&direction=desc&per_page=$PER_PAGE")
        } catch (e: Throwable) {
            if (username.isNullOrEmpty()) throw e
            Net.getArray("https://api.github.com/users/${Net.encodeURIComponent(username)}/repos?sort=stars&direction=desc&per_page=$PER_PAGE")
        }
        val repos = parse(array).sortedByDescending { it.stars }
        cache[githubId] = Cached(repos, System.currentTimeMillis())
        return repos
    }

    private fun parse(array: JSONArray): List<Repo> {
        val repos = ArrayList<Repo>(array.length())
        for (i in 0 until array.length()) {
            val o = array.optJSONObject(i) ?: continue
            val url = o.optString("html_url")
            if (!url.startsWith("https://github.com/")) continue
            repos += Repo(
                name = o.optString("name"),
                url = url,
                stars = o.optInt("stargazers_count"),
                language = o.optString("language").takeIf { it.isNotEmpty() && it != "null" },
                fork = o.optBoolean("fork"),
            )
        }
        return repos
    }

    private companion object {
        const val PER_PAGE = 30
        const val CACHE_TTL = 10 * 60 * 1000L
    }
}
