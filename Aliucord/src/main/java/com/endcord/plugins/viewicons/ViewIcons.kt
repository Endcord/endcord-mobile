/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.viewicons

import android.content.Context
import android.view.View
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.aliucord.patcher.after
import com.discord.databinding.WidgetGuildProfileSheetBinding
import com.discord.widgets.guilds.profile.WidgetGuildProfileSheet
import com.discord.widgets.guilds.profile.WidgetGuildProfileSheetViewModel
import com.discord.widgets.user.profile.UserProfileHeaderView
import com.discord.widgets.user.profile.UserProfileHeaderViewModel
import com.endcord.plugins.commandscommon.Avatars
import com.endcord.plugins.commandscommon.Dialogs
import com.endcord.plugins.commandscommon.Net
import com.endcord.plugins.translatecommon.Downloads
import java.lang.reflect.Method

/**
 * Makes avatars and banners in user profiles, and the icon and banner of the server sheet, open in Discord's media
 * viewer at full size. Long-pressing them offers View, Save and Copy link, which also covers Endcord PC's ProfileMedia.
 */
internal class ViewIcons : EndcordPlugin(
    name = "ViewIcons",
    description = DESCRIPTION,
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("media", "servers", "appearance")

    override val settingsSchema = listOf(
        PluginSetting.Choice(
            key = "format",
            label = "Image format",
            description = "Choose the image format to use for non animated images. Animated images will always use .gif",
            options = listOf(
                PluginSetting.Choice.Option("png", "png"),
                PluginSetting.Choice.Option("webp", "webp"),
                PluginSetting.Choice.Option("jpg", "jpg"),
            ),
        ),
        PluginSetting.Choice(
            key = "imgSize",
            label = "Image Size",
            description = "The image size to use",
            options = listOf("256", "512", "1024", "2048", "4096").map { PluginSetting.Choice.Option(it, it) },
            default = "4096",
        ),
    )

    /** One image that can be viewed: [kind] names it in menus ("Avatar", "Banner", ...). */
    private class Image(val kind: String, val url: String, val fileName: String)

    private val guildSheetBinding: Method by lazy {
        WidgetGuildProfileSheet::class.java.getDeclaredMethod("getBinding").apply { isAccessible = true }
    }

    override fun start(context: Context) {
        active = true
        patcher.after<UserProfileHeaderView>("updateViewState", UserProfileHeaderViewModel.ViewState.Loaded::class.java) { param ->
            try {
                configureUserHeader(this, param.args[0] as UserProfileHeaderViewModel.ViewState.Loaded)
            } catch (e: Throwable) {
                logger.error("Failed to make the profile avatar clickable", e)
            }
        }

        patcher.after<WidgetGuildProfileSheet>(
            "configureGuildIcon",
            Long::class.javaPrimitiveType!!,
            String::class.java,
            String::class.java,
        ) { param ->
            try {
                val hash = param.args[1] as String? ?: return@after
                val guildId = param.args[0] as Long
                val binding = guildSheetBinding.invoke(this) as WidgetGuildProfileSheetBinding
                attach(binding.i, listOf(Image("Server Icon", cdn("icons/$guildId/$hash", hash), "icon_$guildId")))
            } catch (e: Throwable) {
                logger.error("Failed to make the server icon clickable", e)
            }
        }

        patcher.after<WidgetGuildProfileSheet>("configureGuildBanner", WidgetGuildProfileSheetViewModel.Banner::class.java) { param ->
            try {
                val banner = param.args[0] as WidgetGuildProfileSheetViewModel.Banner? ?: return@after
                val hash = banner.hash ?: return@after
                val binding = guildSheetBinding.invoke(this) as WidgetGuildProfileSheetBinding
                val image = if (banner.type == WidgetGuildProfileSheetViewModel.Banner.Type.SPLASH) {
                    Image("Server Splash", cdn("splashes/${banner.guildId}/$hash", hash), "splash_${banner.guildId}")
                } else {
                    Image("Server Banner", cdn("banners/${banner.guildId}/$hash", hash), "banner_${banner.guildId}")
                }
                attach(binding.b, listOf(image))
            } catch (e: Throwable) {
                logger.error("Failed to make the server banner clickable", e)
            }
        }
    }

    private fun configureUserHeader(header: UserProfileHeaderView, state: UserProfileHeaderViewModel.ViewState.Loaded) {
        // Your own profile in edit mode uses these taps to change the avatar and banner
        if (state.editable) return
        val binding = UserProfileHeaderView.`access$getBinding$p`(header)
        val user = state.user
        val name = Downloads.safeName(user.username ?: user.id.toString())

        val global = Avatars.url(Avatars.AvatarOwner(user.id, user.avatar, user.discriminator), 4096)
        val avatars = ArrayList<Image>(2)
        val member = state.guildMember
        val memberAvatar = member?.avatarHash
        if (member != null && !memberAvatar.isNullOrEmpty()) {
            val url = cdn("guilds/${member.guildId}/users/${user.id}/avatars/$memberAvatar", memberAvatar)
            avatars += Image("Server Avatar", url, "server_avatar_$name")
        }
        avatars += Image("Avatar", sized(global, user.avatar), "avatar_$name")
        attach(binding.f, avatars)

        val banners = ArrayList<Image>(2)
        val memberBanner = member?.bannerHash
        if (member != null && !memberBanner.isNullOrEmpty()) {
            banners += Image("Server Banner", cdn("guilds/${member.guildId}/users/${user.id}/banners/$memberBanner", memberBanner), "server_banner_$name")
        }
        val banner = state.banner
        if (!banner.isNullOrEmpty() && banner != memberBanner) {
            val url = if (banner.startsWith("http")) banner else cdn("banners/${user.id}/$banner", banner)
            banners += Image("Banner", url, "banner_$name")
        }
        if (banners.isEmpty()) {
            binding.c.setOnClickListener(null)
            binding.c.setOnLongClickListener(null)
            binding.c.isClickable = false
        } else {
            attach(binding.c, banners)
        }
    }

    /** Tapping [view] opens the first of [images], long-pressing it offers every action for all of them. */
    private fun attach(view: View, images: List<Image>) {
        if (images.isEmpty()) return
        // Sheets that are open while the plugin is turned off keep these listeners until they close
        view.setOnClickListener { if (active) open(images[0]) }
        view.setOnLongClickListener {
            if (active) showActions(it.context, images)
            active
        }
    }

    @Volatile
    private var active = false

    override fun stop(context: Context) {
        active = false
        super.stop(context)
    }

    private fun showActions(context: Context, images: List<Image>) {
        val labels = ArrayList<CharSequence>()
        val actions = ArrayList<() -> Unit>()
        for (image in images) {
            val kind = tr(image.kind)
            labels += tr("View {thing}", "thing" to kind); actions += { open(image) }
            labels += tr("Save {thing}", "thing" to kind); actions += { save(image) }
            labels += tr("Copy {thing} link", "thing" to kind); actions += { Dialogs.copy(image.url) }
        }
        Dialogs.showList(context, tr(images[0].kind), labels) { actions[it]() }
    }

    private fun open(image: Image) {
        try {
            Utils.openMediaViewer(image.url, image.fileName + "." + extension(image.url))
        } catch (e: Throwable) {
            logger.errorToast(tr("Couldn't open the image"), e)
        }
    }

    private fun save(image: Image) {
        Utils.showToast(tr("Downloading..."))
        Utils.threadPool.execute {
            try {
                val bytes = Net.getBytes(image.url, 32 * 1024 * 1024)
                val fileName = image.fileName + "." + extension(image.url)
                val where = Downloads.save(fileName, Downloads.mimeOf(fileName), bytes)
                Utils.showToast(tr("Saved to {path}", "path" to where), true)
            } catch (e: Throwable) {
                logger.error("Failed to save ${image.url}", e)
                Utils.showToast(tr("Failed to save the image: {reason}", "reason" to Net.describe(e)), true)
            }
        }
    }

    /** A full-size CDN url for [path], a gif when [hash] is animated and the chosen format otherwise. */
    private fun cdn(path: String, hash: String): String {
        val ext = if (hash.startsWith("a_")) "gif" else format()
        return "https://cdn.discordapp.com/$path.$ext?size=${choice("imgSize").ifEmpty { "4096" }}"
    }

    /** Applies the format and size settings to a url built elsewhere. */
    private fun sized(url: String, hash: String?): String {
        if (hash.isNullOrEmpty()) return url // default avatars only exist as png
        val base = url.substringBefore('?')
        val ext = if (hash.startsWith("a_")) "gif" else format()
        return base.substringBeforeLast('.') + ".$ext?size=${choice("imgSize").ifEmpty { "4096" }}"
    }

    private fun format() = choice("format").ifEmpty { "png" }

    private fun extension(url: String) = url.substringBefore('?').substringAfterLast('.', "png")

    private companion object {
        const val DESCRIPTION = "Tap avatars and banners in user profiles, and the icon and banner of a server, to view them in full size. Long-press them to save or copy the link."
    }
}
