/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.customcommands

import android.content.Context
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.tr
import com.aliucord.utils.DimenUtils
import com.endcord.plugins.commandscommon.Options
import com.endcord.plugins.commandscommon.Patterns
import org.json.JSONObject
import java.util.regex.Pattern

internal class CustomCommands : EndcordPlugin(
    name = "CustomCommands",
    description = "Allows you to create custom slash commands / tags",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("commands", "customisation", "utility")

    /** A saved tag: [message] is the response, with `{{argument}}` placeholders. */
    private class Tag(val name: String, val message: String)

    private class TagArgument(val name: String, val defaultValue: String?)

    private val argumentRegex = Pattern.compile("\\{\\{(.+?)\\}\\}")
    private val validName = Pattern.compile("^[\\p{L}\\p{N}_-]{1,32}$")

    /** Names that are taken by Discord's own built-in commands. */
    private val reservedNames = setOf("tags", "me", "shrug", "spoiler", "tableflip", "unflip")

    private val lock = Any()
    private val tagMap = LinkedHashMap<String, Tag>()

    /** Whether the tag commands are registered; tags can still be edited from settings while the plugin is off. */
    private var running = false

    override val settingsSchema = listOf(
        PluginSetting.Action(
            key = "createTag",
            label = "Create Tag",
            description = "Your response can include variables wrapped in double curly braces which will become command arguments, for example Hello {{user}}. Add a default value with an equals sign: {{mood = great}}.",
        ) { context -> openEditor(context, null) },
        PluginSetting.Action(
            key = "registeredTags",
            label = "Registered Tags",
        ) { context -> openTagList(context) },
    )

    override fun load(context: Context) {
        super.load(context)
        synchronized(lock) { tagMap.putAll(loadTags()) }
    }

    override fun stop(context: Context) {
        synchronized(lock) {
            running = false
            super.stop(context)
        }
    }

    override fun start(context: Context) {
        synchronized(lock) {
            running = true
            for (tag in tagMap.values) registerTag(tag)
        }

        commands.registerCommand(
            "tags",
            "Manage all custom commands",
            listOf(
                Options.subcommand(
                    "create", "Create a new tag",
                    listOf(
                        Options.string("tag-name", "The name of the tag", required = true),
                        Options.string("message", "The response, use {{name}} for arguments and \\n for new lines", required = true),
                    ),
                ),
                Options.subcommand("list", "List all your tags"),
                Options.subcommand(
                    "delete", "Remove a tag by name",
                    listOf(Options.string("tag-name", "The name of the tag", required = true)),
                ),
            ),
        ) { ctx ->
            when {
                ctx.containsArg("create") -> {
                    val args = ctx.getRequiredSubCommandArgs("create")
                    val name = (args["tag-name"] as? String).orEmpty()
                    val message = (args["message"] as? String).orEmpty()
                    val error = saveTag(null, name, message)
                    CommandResult(error ?: tr("Successfully created the tag **{name}**!", "name" to normalize(name)), null, false)
                }

                ctx.containsArg("delete") -> {
                    val name = normalize((ctx.getRequiredSubCommandArgs("delete")["tag-name"] as? String).orEmpty())
                    val removed = removeTag(name)
                    CommandResult(
                        if (removed) tr("Successfully deleted the tag **{name}**!", "name" to name)
                        else tr("A Tag with the name **{name}** does not exist!", "name" to name),
                        null,
                        false,
                    )
                }

                else -> {
                    val list = synchronized(lock) { tagMap.values.toList() }
                    val content = list.joinToString("\n") { tag ->
                        val preview = tag.message.replace("\\n", " ")
                        "`${tag.name}`: ${preview.take(72)}${if (preview.length > 72) "..." else ""}"
                    }
                    CommandResult(content.ifEmpty { tr("Woops! There are no tags yet, use `/tags create` to create one!") }, null, false)
                }
            }
        }
    }

    private fun normalize(name: String) = name.trim().lowercase()

    private fun parseArguments(message: String): List<TagArgument> {
        val args = ArrayList<TagArgument>()
        for (inner in Patterns.findAll(argumentRegex, message, 1)) {
            val parts = inner.split('=').map { it.trim() }
            val name = parts[0].lowercase()
            if (name.isEmpty() || args.any { it.name == name }) continue
            args += TagArgument(name, parts.getOrNull(1))
        }
        return args
    }

    private fun registerTag(tag: Tag) {
        val arguments = parseArguments(tag.message)
        val options = arguments.map { Options.string(it.name, it.name, required = it.defaultValue == null) } +
            Options.bool("ephemeral", "Whether the response should only be visible to you")

        commands.registerCommand(tag.name, tag.name, options) { ctx ->
            val response = Patterns.replace(argumentRegex, tag.message) { match ->
                val parts = match.group(1)!!.split('=').map { it.trim() }
                ctx.getString(parts[0].lowercase())?.takeIf { it.isNotEmpty() } ?: parts.getOrNull(1) ?: match.group()
            }.replace("\\n", "\n")
            CommandResult(response, null, !ctx.getBoolOrDefault("ephemeral", false))
        }
    }

    /**
     * Creates or replaces a tag, renaming [oldName] if given. Returns an error message, or null on success.
     * Safe to call from any thread.
     */
    private fun saveTag(oldName: String?, rawName: String, message: String): String? {
        val name = normalize(rawName)
        if (!validName.matcher(name).matches()) return tr("Tag names can only contain letters, numbers, - and _ (up to 32 characters).")
        if (message.isBlank()) return tr("The response can't be empty.")
        val arguments = parseArguments(message)
        if (arguments.any { it.name == "ephemeral" }) return tr("The argument name \"ephemeral\" is reserved and cannot be used.")
        if (arguments.any { !validName.matcher(it.name).matches() }) return tr("Argument names can only contain letters, numbers, - and _ (up to 32 characters).")
        if (arguments.size > 24) return tr("A tag can have at most 24 arguments.")

        synchronized(lock) {
            val owner = CommandsAPI.commandsAndPlugins[name]
            if (name in reservedNames || (owner != null && owner != this.name)) {
                return tr("/{name} already exists, pick another name.", "name" to name)
            }
            if (oldName != null && oldName != name) {
                tagMap.remove(oldName)
                if (running) commands.unregisterCommand(oldName)
            }
            if (running && tagMap.containsKey(name)) commands.unregisterCommand(name)
            val tag = Tag(name, message)
            tagMap[name] = tag
            if (running) registerTag(tag)
        }
        persist()
        return null
    }

    private fun removeTag(name: String): Boolean {
        synchronized(lock) {
            if (tagMap.remove(name) == null) return false
            if (running) commands.unregisterCommand(name)
        }
        persist()
        return true
    }

    private fun loadTags(): Map<String, Tag> {
        val result = LinkedHashMap<String, Tag>()
        try {
            val json = JSONObject(settings.getString(TAGS_KEY, "{}") ?: "{}")
            for (key in json.keys()) {
                val obj = json.optJSONObject(key) ?: continue
                val name = obj.optString("name", key)
                val message = obj.optString("message")
                if (name.isNotEmpty() && message.isNotEmpty()) result[name] = Tag(name, message)
            }
        } catch (e: Throwable) {
            logger.error("Failed to read saved tags", e)
        }
        return result
    }

    /** Writes the tags to disk off the main thread. Serialised under the lock so the last write always wins. */
    private fun persist() {
        Utils.threadPool.execute {
            synchronized(lock) {
                val json = JSONObject()
                for (tag in tagMap.values) json.put(tag.name, JSONObject().put("name", tag.name).put("message", tag.message))
                settings.setString(TAGS_KEY, json.toString())
            }
        }
    }

    private fun openTagList(context: Context) {
        val list = synchronized(lock) { tagMap.values.toList() }
        if (list.isEmpty()) {
            Utils.showToast(tr("Woops! There are no tags yet, use `/tags create` to create one!"))
            return
        }
        AlertDialog.Builder(context)
            .setTitle(tr("Registered Tags"))
            .setItems(list.map { "/${it.name}" }.toTypedArray()) { _, which -> openTagActions(context, list[which]) }
            .setNegativeButton(tr("Close"), null)
            .show()
    }

    private fun openTagActions(context: Context, tag: Tag) {
        AlertDialog.Builder(context)
            .setTitle("/${tag.name}")
            .setMessage(tag.message.replace("\\n", "\n"))
            .setPositiveButton(tr("Edit Tag")) { _, _ -> openEditor(context, tag) }
            .setNegativeButton(tr("Delete")) { _, _ ->
                Utils.threadPool.execute {
                    removeTag(tag.name)
                    Utils.showToast(tr("Successfully deleted the tag **{name}**!", "name" to tag.name).replace("**", ""))
                }
            }
            .setNeutralButton(tr("Close"), null)
            .show()
    }

    /** A small form for creating ([existing] null) or editing a tag. */
    private fun openEditor(context: Context, existing: Tag?) {
        val padding = DimenUtils.defaultPadding
        val nameInput = EditText(context).apply {
            hint = "greet"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_FILTER
            setSingleLine()
            existing?.let { setText(it.name) }
        }
        val messageInput = EditText(context).apply {
            hint = "Hello {{user}}! I am feeling {{mood = great}}."
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 2
            maxLines = 8
            existing?.let { setText(it.message.replace("\\n", "\n")) }
        }
        val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding / 2, padding, 0)
            addView(TextView(context).apply { text = tr("Name") })
            addView(nameInput)
            addView(TextView(context).apply { text = tr("Response") })
            addView(messageInput)
        }

        val dialog = AlertDialog.Builder(context)
            .setTitle(if (existing == null) tr("Create New Tag") else tr("Edit Tag"))
            .setView(layout)
            .setPositiveButton(if (existing == null) tr("Create") else tr("Save"), null)
            .setNegativeButton(tr("Cancel"), null)
            .create()
        dialog.setOnShowListener {
            // Replace the default listener so the dialog stays open when the input is invalid
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                // Store real line breaks the way Endcord PC does, as "\n"
                val message = messageInput.text.toString().replace("\n", "\\n")
                val name = nameInput.text.toString()
                Utils.threadPool.execute {
                    val error = saveTag(existing?.name, name, message)
                    Utils.mainThread.post {
                        if (error != null) {
                            Utils.showToast(error.replace("**", ""), true)
                        } else {
                            Utils.showToast(tr("Saved"))
                            dialog.dismiss()
                        }
                    }
                }
            }
        }
        dialog.show()
    }

    private companion object {
        const val TAGS_KEY = "tagsList"
    }
}
