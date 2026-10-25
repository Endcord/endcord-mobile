/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildscommon

import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.api.PatcherAPI
import com.aliucord.patcher.after
import com.aliucord.patcher.before
import com.discord.api.channel.Channel
import com.discord.api.guildjoinrequest.GuildJoinRequest
import com.discord.databinding.WidgetChannelsListItemChannelBinding
import com.discord.databinding.WidgetChannelsListItemChannelPrivateBinding
import com.discord.databinding.WidgetChannelsListItemChannelVoiceBinding
import com.discord.models.member.GuildMember
import com.discord.utilities.channel.GuildChannelsInfo
import com.discord.widgets.channels.list.WidgetChannelListModel
import com.discord.widgets.channels.list.WidgetChannelsList
import com.discord.widgets.channels.list.WidgetChannelsListAdapter
import com.discord.widgets.channels.list.items.ChannelListItem
import com.discord.widgets.channels.list.items.ChannelListItemPrivate
import com.discord.widgets.channels.list.items.ChannelListItemTextChannel
import com.discord.widgets.channels.list.items.ChannelListItemVoiceChannel
import de.robv.android.xposed.XC_MethodHook
import java.lang.ref.WeakReference
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.util.concurrent.CopyOnWriteArrayList

/**
 * One set of hooks on the channel list (servers and direct messages) shared by every plugin of this batch, so
 * plugins that reorder, hide or decorate channels never patch the same methods twice.
 *
 * Lists are rewritten at the model level, right after Discord built them, so collapsing categories, unread
 * indicators and positions stay consistent with what is shown.
 */
internal object ChannelListHooks {
    /** Rewrites the channel lists. Runs on a background thread, keep it cheap. */
    interface Transformer {
        /** Changes the items of a server's channel list in place. */
        fun guildList(guildId: Long, items: MutableList<ChannelListItem>) {}

        /** Changes the items of the direct messages list in place. */
        fun privateList(items: MutableList<ChannelListItem>) {}
    }

    /** Decorates channel rows after Discord bound them, on the main thread. Rows are recycled: undo what you changed. */
    interface RowDecorator {
        fun text(item: ChannelListItemTextChannel, binding: WidgetChannelsListItemChannelBinding) {}
        fun voice(item: ChannelListItemVoiceChannel, binding: WidgetChannelsListItemChannelVoiceBinding) {}
        fun private(item: ChannelListItemPrivate, binding: WidgetChannelsListItemChannelPrivateBinding) {}
    }

    private class Reg<T>(val owner: String, val priority: Int, val value: T)

    private val logger = Logger("ChannelListHooks")
    private val patcher = PatcherAPI(logger)

    private val transformers = CopyOnWriteArrayList<Reg<Transformer>>()
    private val decorators = CopyOnWriteArrayList<Reg<RowDecorator>>()
    private val interceptors = CopyOnWriteArrayList<Reg<(Channel) -> Boolean>>()

    private var listPatched = false
    private var rowsPatched = false
    private var selectPatched = false

    private val building = ThreadLocal<Boolean>()

    /** Whether the current thread is inside Discord's server channel list builder. */
    @JvmStatic
    fun isBuilding(): Boolean = building.get() == true

    // Kept to rebuild the list on demand after a setting changed.
    private class GuildBuild(val companion: Any, val args: Array<Any?>, val guildId: Long)

    @Volatile private var lastGuildBuild: GuildBuild? = null
    @Volatile private var lastPrivateBuilder: Any? = null
    @Volatile private var fragment: WeakReference<WidgetChannelsList>? = null
    @Volatile private var lastModel: WidgetChannelListModel? = null

    private val companionClass by lazy { Class.forName("com.discord.widgets.channels.list.WidgetChannelListModel\$Companion") }
    private val privateBuilderClass by lazy {
        Class.forName("com.discord.widgets.channels.list.WidgetChannelListModel\$Companion\$getPrivateChannelList\$1")
    }

    private val guildListBuilder: Method by lazy {
        val map = Map::class.java
        val set = Set::class.java
        val long = Long::class.javaPrimitiveType!!
        val bool = Boolean::class.javaPrimitiveType!!
        companionClass.getDeclaredMethod(
            "guildListBuilder",
            long, GuildChannelsInfo::class.java, map, map, map, set, Channel::class.java, long, map, map, set, set, map,
            map, List::class.java, bool, bool, map, map, map, GuildJoinRequest::class.java, GuildMember::class.java,
        ).apply { isAccessible = true }
    }
    private val privateBuilderCall: Method by lazy {
        privateBuilderClass.getDeclaredMethod("call", Unit::class.java).apply { isAccessible = true }
    }
    private val configureUI: Method by lazy {
        WidgetChannelsList::class.java.getDeclaredMethod("configureUI", WidgetChannelListModel::class.java)
            .apply { isAccessible = true }
    }
    private val adapterField: Field by lazy {
        WidgetChannelsList::class.java.getDeclaredField("adapter").apply { isAccessible = true }
    }

    private fun bindingField(cls: Class<*>): Field = cls.getDeclaredField("binding").apply { isAccessible = true }
    private val textBinding by lazy { bindingField(WidgetChannelsListAdapter.ItemChannelText::class.java) }
    private val voiceBinding by lazy { bindingField(WidgetChannelsListAdapter.ItemChannelVoice::class.java) }
    private val privateBinding by lazy { bindingField(WidgetChannelsListAdapter.ItemChannelPrivate::class.java) }

    /**
     * Hooks the list early, before any plugin registered, so the list shown right now can be rebuilt with
     * [refresh] as soon as a plugin is turned on.
     */
    @JvmStatic
    fun prepare() {
        try {
            ensureListPatched()
        } catch (e: Throwable) {
            logger.error("Failed to hook the list", e)
        }
    }

    @JvmStatic
    fun register(owner: String, transformer: Transformer, priority: Int = 0) {
        add(transformers, Reg(owner, priority, transformer))
        ensureListPatched()
    }

    @JvmStatic
    fun registerDecorator(owner: String, decorator: RowDecorator, priority: Int = 0) {
        add(decorators, Reg(owner, priority, decorator))
        ensureRowsPatched()
    }

    /** [handler] gets every channel the user taps in the channel list and returns true when it handled the tap. */
    @JvmStatic
    fun interceptSelect(owner: String, handler: (Channel) -> Boolean) {
        add(interceptors, Reg(owner, 0, handler))
        ensureSelectPatched()
    }

    @JvmStatic
    fun unregisterAll(owner: String) {
        transformers.removeAll { it.owner == owner }
        decorators.removeAll { it.owner == owner }
        interceptors.removeAll { it.owner == owner }
    }

    private fun <T> add(list: CopyOnWriteArrayList<Reg<T>>, reg: Reg<T>) {
        synchronized(list) {
            val index = list.indexOfFirst { it.priority > reg.priority }
            if (index < 0) list.add(reg) else list.add(index, reg)
        }
    }

    /** Rebuilds the channel list shown right now, for example after a plugin setting changed. */
    @JvmStatic
    fun refresh() {
        val frag = fragment?.get() ?: return
        val model = lastModel ?: return
        Utils.threadPool.execute {
            try {
                val newModel = if (model.isGuildSelected) {
                    val build = lastGuildBuild ?: return@execute
                    if (build.guildId != model.selectedGuild?.id) return@execute
                    @Suppress("UNCHECKED_CAST")
                    val items = guildListBuilder.invoke(build.companion, *build.args) as? List<ChannelListItem> ?: return@execute
                    rebuild(model, items)
                } else {
                    val builder = lastPrivateBuilder ?: return@execute
                    privateBuilderCall.invoke(builder, Unit::class.java.getField("INSTANCE").get(null)) as? WidgetChannelListModel ?: return@execute
                }
                Utils.mainThread.post {
                    try {
                        if (frag.isAdded) configureUI.invoke(frag, newModel)
                    } catch (e: Throwable) {
                        logger.error("Failed to refresh the channel list", e)
                    }
                }
            } catch (e: Throwable) {
                logger.error("Failed to rebuild the channel list", e)
            }
        }
    }

    /** Binds the visible channel rows again, for changes that only affect how rows look. */
    @JvmStatic
    fun rebind() {
        Utils.mainThread.post {
            try {
                val frag = fragment?.get() ?: return@post
                (adapterField.get(frag) as? WidgetChannelsListAdapter)?.notifyDataSetChanged()
            } catch (e: Throwable) {
                logger.error("Failed to redraw the channel list", e)
            }
        }
    }

    /** A copy of [model] showing [items]; the components are passed in constructor order. */
    private fun rebuild(model: WidgetChannelListModel, items: List<ChannelListItem>) = WidgetChannelListModel(
        model.component1(), items, model.component3(), model.component4(), model.component5(), model.component6(),
    )

    private fun applyTransformers(items: List<ChannelListItem>, guildId: Long?): MutableList<ChannelListItem> {
        val list = ArrayList(items)
        for (reg in transformers) {
            try {
                if (guildId != null) reg.value.guildList(guildId, list) else reg.value.privateList(list)
            } catch (e: Throwable) {
                logger.error("${reg.owner}: failed to change the channel list", e)
            }
        }
        return list
    }

    @Synchronized
    private fun ensureListPatched() {
        if (listPatched) return
        listPatched = true

        patcher.patch(guildListBuilder, object : XC_MethodHook() {
            override fun beforeHookedMethod(param: MethodHookParam) {
                building.set(true)
                lastGuildBuild = GuildBuild(param.thisObject, param.args.clone(), param.args[0] as Long)
            }

            override fun afterHookedMethod(param: MethodHookParam) {
                building.set(false)
                if (transformers.isEmpty()) return
                try {
                    @Suppress("UNCHECKED_CAST")
                    val items = param.result as? List<ChannelListItem> ?: return
                    param.result = applyTransformers(items, param.args[0] as Long)
                } catch (e: Throwable) {
                    logger.error("Failed to change the channel list", e)
                }
            }
        })

        patcher.patch(privateBuilderCall, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                lastPrivateBuilder = param.thisObject
                if (transformers.isEmpty()) return
                try {
                    val model = param.result as? WidgetChannelListModel ?: return
                    val items = applyTransformers(model.items, null)
                    param.result = rebuild(model, items)
                } catch (e: Throwable) {
                    logger.error("Failed to change the direct messages list", e)
                }
            }
        })

        patcher.before<WidgetChannelsList>("configureUI", WidgetChannelListModel::class.java) { param ->
            if (fragment?.get() !== this) fragment = WeakReference(this)
            lastModel = param.args[0] as? WidgetChannelListModel
        }
    }

    @Synchronized
    private fun ensureRowsPatched() {
        if (rowsPatched) return
        rowsPatched = true
        val int = Int::class.javaPrimitiveType!!

        patcher.after<WidgetChannelsListAdapter.ItemChannelText>("onConfigure", int, ChannelListItem::class.java) { param ->
            if (decorators.isEmpty()) return@after
            val item = param.args[1] as? ChannelListItemTextChannel ?: return@after
            val binding = textBinding.get(this) as? WidgetChannelsListItemChannelBinding ?: return@after
            for (reg in decorators) {
                try {
                    reg.value.text(item, binding)
                } catch (e: Throwable) {
                    logger.error("${reg.owner}: failed to decorate a channel", e)
                }
            }
        }
        patcher.after<WidgetChannelsListAdapter.ItemChannelVoice>("onConfigure", int, ChannelListItem::class.java) { param ->
            if (decorators.isEmpty()) return@after
            val item = param.args[1] as? ChannelListItemVoiceChannel ?: return@after
            val binding = voiceBinding.get(this) as? WidgetChannelsListItemChannelVoiceBinding ?: return@after
            for (reg in decorators) {
                try {
                    reg.value.voice(item, binding)
                } catch (e: Throwable) {
                    logger.error("${reg.owner}: failed to decorate a voice channel", e)
                }
            }
        }
        patcher.after<WidgetChannelsListAdapter.ItemChannelPrivate>("onConfigure", int, ChannelListItem::class.java) { param ->
            if (decorators.isEmpty()) return@after
            val item = param.args[1] as? ChannelListItemPrivate ?: return@after
            val binding = privateBinding.get(this) as? WidgetChannelsListItemChannelPrivateBinding ?: return@after
            for (reg in decorators) {
                try {
                    reg.value.private(item, binding)
                } catch (e: Throwable) {
                    logger.error("${reg.owner}: failed to decorate a direct message", e)
                }
            }
        }
    }

    /** Wraps the adapter's tap callbacks so interceptors see a channel before Discord opens it. */
    private class SelectWrapper(private val original: Function1<Channel, Unit>) : Function1<Channel, Unit> {
        override fun invoke(channel: Channel) {
            for (reg in interceptors) {
                try {
                    if (reg.value(channel)) return
                } catch (e: Throwable) {
                    logger.error("${reg.owner}: failed to handle a channel tap", e)
                }
            }
            original.invoke(channel)
        }
    }

    @Synchronized
    private fun ensureSelectPatched() {
        if (selectPatched) return
        selectPatched = true

        val wrap: (XC_MethodHook.MethodHookParam) -> Unit = { param ->
            if (interceptors.isNotEmpty()) {
                @Suppress("UNCHECKED_CAST")
                val original = param.result as? Function1<Channel, Unit>
                if (original != null && original !is SelectWrapper) param.result = SelectWrapper(original)
            }
        }
        patcher.after<WidgetChannelsListAdapter>("getOnSelectChannel") { wrap(it) }
        patcher.after<WidgetChannelsListAdapter>("getOnCallChannel") { wrap(it) }
    }
}
