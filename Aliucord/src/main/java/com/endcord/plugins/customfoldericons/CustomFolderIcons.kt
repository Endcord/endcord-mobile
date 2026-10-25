/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.customfoldericons

import android.content.Context
import android.text.InputType
import android.view.View
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.fragments.InputDialog
import com.aliucord.i18n.I18n
import com.aliucord.patcher.after
import com.aliucord.utils.RxUtils
import com.aliucord.utils.RxUtils.subscribe
import com.discord.databinding.WidgetGuildsListItemFolderBinding
import com.discord.models.domain.ModelGuildFolder
import com.discord.stores.StoreStream
import com.discord.views.ServerFolderView
import com.discord.widgets.guilds.list.GuildListItem
import com.discord.widgets.guilds.list.GuildListViewHolder
import com.endcord.plugins.commandscommon.Dialogs
import org.json.JSONObject
import rx.Subscription
import java.lang.reflect.Field
import java.util.WeakHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Replaces the mini server grid of a closed server folder with a picture from a link.
 *
 * A closed folder ([ServerFolderView]) shows a grid of up to four server icons; the open one shows Discord's folder
 * icon, which is left alone. The picture is drawn as the view's foreground while the grid is hidden, so the
 * layout of the guild list doesn't change. Icons are chosen from this plugin's settings page.
 */
internal class CustomFolderIcons : EndcordPlugin(
    name = "CustomFolderIcons",
    description = "Customize server folder icons with any PNG",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("appearance", "customisation", "organisation")

    override val settingsSchema = listOf(
        PluginSetting.Action(
            key = "change",
            label = "Change Icon",
            description = "Pick a folder, then paste a link to an image",
        ) { pickFolder(it) },
        PluginSetting.Switch(
            key = "solidIcon",
            label = "Use a solid background on the background of the image",
        ),
        PluginSetting.Number(
            key = "size",
            label = "Change the size of the folder icon",
            description = "In percent of the folder",
            default = 100,
            min = 25,
            max = 200,
        ),
    )

    /** Folder id to image link. Main thread only. */
    private var icons: MutableMap<Long, String> = HashMap()

    /** Every folder view seen, with its folder colour, so a change can be applied without waiting for a rebind. */
    private val folderViews = WeakHashMap<ServerFolderView, Int?>()

    /** Folder views currently showing a custom icon. */
    private val customised = WeakHashMap<ServerFolderView, Boolean>()

    private var running = false

    override fun start(context: Context) {
        running = true
        icons = loadIcons()

        patcher.after<GuildListViewHolder.FolderViewHolder>("configure", GuildListItem.FolderItem::class.java) { param ->
            try {
                val item = param.args[0] as GuildListItem.FolderItem
                val binding = bindingField.get(this) as WidgetGuildsListItemFolderBinding
                folderViews[binding.b] = item.color
                applyIcon(binding.b)
            } catch (e: Throwable) {
                logger.error("Failed to set a folder icon", e)
            }
        }
        // Called at the end of the open / close animation, when Discord shows the grid again
        patcher.after<ServerFolderView>("a") {
            try {
                applyIcon(this)
            } catch (e: Throwable) {
                logger.error("Failed to set a folder icon", e)
            }
        }
    }

    override fun onSettingChanged(key: String) {
        refreshAll()
    }

    override fun stop(context: Context) {
        super.stop(context)
        running = false
        for (view in customised.keys.toList()) clear(view)
        customised.clear()
        folderViews.clear()
        FolderImages.clear()
    }

    private fun applyIcon(view: ServerFolderView) {
        val url = view.l?.let { icons[it] }
        // An open folder keeps Discord's folder icon
        if (!running || url == null || view.m) return clear(view)

        val bitmap = FolderImages.get(url)
        if (bitmap == null) {
            clear(view)
            val folderId = view.l
            FolderImages.load(url) { if (running && view.l == folderId) applyIcon(view) }
            return
        }
        val color = if (bool("solidIcon")) folderViews[view] ?: DEFAULT_FOLDER_COLOR else null
        view.foreground = FolderIconDrawable(bitmap, int("size").coerceIn(25, 200), color)
        view.k.g.visibility = View.INVISIBLE
        customised[view] = true
    }

    private fun clear(view: ServerFolderView) {
        if (customised.remove(view) == null) return
        view.foreground = null
        view.k.g.visibility = if (view.m) View.GONE else View.VISIBLE
    }

    private fun refreshAll() {
        for (view in folderViews.keys.toList()) applyIcon(view)
    }

    private fun loadIcons(): MutableMap<Long, String> {
        val map = HashMap<Long, String>()
        try {
            val json = JSONObject(settings.getString(KEY_ICONS, "{}") ?: "{}")
            for (key in json.keys()) {
                val id = key.toLongOrNull() ?: continue
                json.optString(key).takeIf { it.isNotEmpty() }?.let { map[id] = it }
            }
        } catch (e: Throwable) {
            logger.error("Failed to read folder icons", e)
        }
        return map
    }

    private fun saveIcon(folderId: Long, url: String?) {
        if (url == null) icons.remove(folderId) else icons[folderId] = url
        val json = JSONObject()
        for ((id, link) in icons) json.put(id.toString(), link)
        settings.setString(KEY_ICONS, json.toString())
        refreshAll()
    }

    /** Lists the user's folders, then asks for the image of the chosen one. */
    private fun pickFolder(context: Context) {
        withFolders { all ->
            val folders = all.filter { it.id != null }
            if (folders.isEmpty()) {
                Utils.showToast(I18n.t("You don't have any server folders"))
                return@withFolders
            }
            val labels = folders.map { folder ->
                val name = label(folder)
                if (folder.id in icons) "$name ✓" else name
            }
            Dialogs.showList(context, I18n.t("Change Icon"), labels) { index -> askUrl(folders[index]) }
        }
    }

    private fun label(folder: ModelGuildFolder): String {
        folder.name?.takeIf { it.isNotBlank() }?.let { return it }
        val guilds = StoreStream.getGuilds()
        val names = folder.guildIds.take(3).mapNotNull { guilds.getGuild(it)?.name }
        return if (names.isEmpty()) I18n.t("Unnamed folder") else names.joinToString(", ")
    }

    private fun askUrl(folder: ModelGuildFolder) {
        val folderId = folder.id ?: return
        val existing = icons[folderId]
        val dialog = InputDialog()
            .setTitle(I18n.t("Set a New Icon."))
            .setDescription(I18n.t("Paste a link to a PNG, JPG or GIF image. Save it empty to go back to the server icons."))
            .setPlaceholderText("https://example.com/image.png")
            .setInputType(InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        dialog.setOnDialogShownListener {
            if (existing != null) dialog.inputLayout.editText?.setText(existing)
        }
        dialog.setOnOkListener {
            val url = dialog.input.trim()
            if (url.isEmpty()) {
                saveIcon(folderId, null)
                Utils.showToast(I18n.t("Folder icon removed"))
            } else if (!url.startsWith("https://") && !url.startsWith("http://")) {
                Utils.showToast(I18n.t("Enter a link starting with https://"))
                return@setOnOkListener
            } else {
                FolderImages.forget(url)
                saveIcon(folderId, url)
            }
            dialog.dismiss()
        }
        dialog.show(Utils.appActivity.supportFragmentManager, "CustomFolderIcons")
    }

    /** Calls [onResult] on the main thread with the user's folders, taking a single value from the store. */
    private fun withFolders(onResult: (List<ModelGuildFolder>) -> Unit) {
        val done = AtomicBoolean(false)
        var subscription: Subscription? = null
        subscription = StoreStream.getUserSettings().observeGuildFolders().subscribe(
            RxUtils.createActionSubscriber<List<ModelGuildFolder>>({ folders ->
                if (done.compareAndSet(false, true)) {
                    Utils.mainThread.post {
                        subscription?.unsubscribe()
                        onResult(folders ?: emptyList())
                    }
                }
            }),
        )
        if (done.get()) subscription.unsubscribe()
    }

    private companion object {
        const val KEY_ICONS = "folderIcons"

        /** Discord's default folder colour (blurple) for folders without one. */
        const val DEFAULT_FOLDER_COLOR = 0xFF5865F2.toInt()

        val bindingField: Field by lazy {
            GuildListViewHolder.FolderViewHolder::class.java.getDeclaredField("binding").apply { isAccessible = true }
        }
    }
}
